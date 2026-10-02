import { limited } from "@/lib/server/http";
import { photonPlaces } from "@/lib/place-search";
import { places } from "@/lib/catalog";
import type { Place } from "@/lib/types";

const cache = new Map<string, { at: number; places: Place[] }>();
type Lookup = { task: Promise<Place[]>; controller: AbortController; users: Set<AbortSignal> };
const pending = new Map<string, Lookup>();
let gate = Promise.resolve();
let lastRequest = 0;
const reply = (results: Place[], source: string, started: number) => Response.json({ places: results }, {
  headers: { "Cache-Control": "private, max-age=86400", "Server-Timing": `${source};dur=${Date.now()-started}` },
});
export async function GET(request: Request) {
  return limited("search", () => search(request), request);
}
async function search(request: Request) {
  const started=Date.now();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const locale = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "zh";
  if (query.length > 80) throw new Error("INVALID_PLACE");
  if (query.length < 2) return Response.json({ places: [] });
  const key = `${locale}:${query.toLocaleLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 86400000) return reply(cached.places,"cache",started);
  if (pending.size >= 3 && !pending.has(key)) return Response.json({ error: "搜索稍忙，请稍后再试。" }, { status: 429, headers: { "Retry-After": "1", "Cache-Control": "no-store" } });
  let lookup = pending.get(key);
  if (lookup?.controller.signal.aborted) { pending.delete(key); lookup=undefined; }
  if (!lookup) {
    const controller=new AbortController();
    const users=new Set<AbortSignal>();
    const slot=gate.then(async()=>{
      controller.signal.throwIfAborted();
      const wait=1000-(Date.now()-lastRequest);
      if(wait>0) await new Promise<void>((resolve,reject)=>{
        const done=()=>{controller.signal.removeEventListener("abort",cancel);resolve();};
        const timer=setTimeout(done,wait);
        const cancel=()=>{clearTimeout(timer);reject(new DOMException("Aborted","AbortError"));};
        controller.signal.addEventListener("abort",cancel,{once:true});
      });
      controller.signal.throwIfAborted();
      lastRequest=Date.now();
    });
    // Limit request starts, without making a new query wait for a slow old response.
    gate=slot.then(()=>{},()=>{});
    const task=slot.then(async()=>{
      const url=new URL(process.env.PHOTON_URL || "https://photon.komoot.io/api/");
      url.searchParams.set("q",query);url.searchParams.set("limit","8");
      if (locale === "en") url.searchParams.set("lang","en");
      for(const layer of ["city","district","county","locality"]) url.searchParams.append("layer",layer);
      const response=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]),headers:{"User-Agent":"OneDay-Noncommercial-Prototype/0.1"}});
      if(!response.ok) throw new Error("search");
      const results=photonPlaces(await response.json()).map(p=>places.find(known=>
        [known.name,known.englishName].some(name=>name.toLocaleLowerCase()===p.name.toLocaleLowerCase()) &&
        Math.hypot(known.center[0]-p.center[0],known.center[1]-p.center[1])<.3) ?? p);
      cache.set(key,{at:Date.now(),places:results});
      if(cache.size>128) cache.delete(cache.keys().next().value!);
      return results;
    });
    lookup={task,controller,users};pending.set(key,lookup);
    const entry=lookup;
    void task.finally(()=>{if(pending.get(key)===entry)pending.delete(key);}).catch(()=>{});
  }
  const entry=lookup;
  entry.users.add(request.signal);
  const cancel=()=>{entry.users.delete(request.signal);if(!entry.users.size)entry.controller.abort();};
  request.signal.addEventListener("abort",cancel,{once:true});
  if(request.signal.aborted)cancel();
  try{return reply(await entry.task,"photon",started);}
  catch{return Response.json({error:"地点搜索暂时没连上，可以重试或先选已收录的地点。"},{status:503});}
  finally{request.signal.removeEventListener("abort",cancel);entry.users.delete(request.signal);}
}
