import places from "@/lib/places.json";
import type { Place } from "@/lib/types";
import { database, dataMode } from "@/lib/server/db";
import { DiaryRepository } from "@/lib/server/repository";
import { previewDiaries } from "@/lib/server/preview";
import { decodeCursor, publishSchema, readLimit } from "@/lib/server/contracts";
import { limited, json, readBody } from "@/lib/server/http";
import { moderate } from "@/lib/server/moderation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  return limited("query", async () => {
    const params = new URL(request.url).searchParams;
    const placeId = params.get("placeId");
    if (!placeId || placeId.length > 100) throw new Error("INVALID_PLACE");
    const limit = readLimit(params.get("limit"), 30, 50);
    const cursor = decodeCursor(params.get("cursor"));
    if (dataMode() === "preview") return json({ diaries: previewDiaries.filter(d => d.placeId === placeId).slice(0, limit), nextCursor: null });
    return json(await new DiaryRepository(database()).list(placeId, limit, cursor));
  }, request);
}
export async function POST(request: Request) {
  return limited("diary", async () => {
    const input = publishSchema.parse(await readBody(request));
    const known = places.find(p => p.id === input.place.id) as Place | undefined;
    if (!known && (input.place.origin !== "photon" || !/^osm-[NRW]-\d+$/.test(input.place.id))) throw new Error("INVALID_PLACE");
    const place = known ?? input.place, mode = dataMode();
    const repo = mode === "database" ? new DiaryRepository(database()) : null;
    const existing = await repo?.existingDiary(input, place);
    if (existing) return json({ diary: existing.diary });
    const approval = await moderate({ kind: "diary", body: input.body, place: {
      name: place.name, englishName: place.englishName, region: place.region, country: place.country, aliases: place.aliases,
    } });
    if (!repo) return json({ preview: true });
    const result = await repo.publish(input, place, approval);
    return json({ diary: result.diary }, result.created ? 201 : 200);
  }, request);
}
