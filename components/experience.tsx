"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import { places, registerPlace, restorePlaces } from "@/lib/catalog";
import { getDiscovery, getDiaries, getDiary, publishDiary } from "@/lib/diary-api";
import { diaryStats } from "@/lib/diary-stats";
import { readSavedDays, saveDay, type DayInput } from "@/lib/local-days";
import type { Diary, Place, Discovery, DiaryPage, StreamDiary } from "@/lib/types";
import type { EarthHandle } from "./earth";
import Compose from "./compose";
import DiaryDeck from "./diary-deck";
import PlacePicker from "./place-picker";
import DiaryStream from "./diary-stream";
import { useDiaryStream } from "./use-diary-stream";
import { demoDiaries } from "@/lib/demo";
import { STREAM_SIZE } from "@/lib/limits";
import { LanguageSwitch, useLocale } from "./locale-provider";
import type { ViewOrigin } from "@/lib/view-origin";
import CommunityLinks from "./community-links";
const Earth = dynamic(() => import("./earth"), { ssr: false });

export default function Experience() {
  const {locale,t}=useLocale();
  const [origin,setOrigin]=useState<ViewOrigin | null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/view-origin",{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(2500)]),cache:"no-store"})
      .then(r=>r.ok?r.json():null).then(value=>{
        if(!controller.signal.aborted && Array.isArray(value?.center) && value.center.length===2 && value.center.every(Number.isFinite)) setOrigin(value);
      }).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  const earth = useRef<EarthHandle>(null);
  const search = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [overview, setOverview] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Place | null>(null);
  const [panel, setPanel] = useState(false);
  const [diary, setDiary] = useState<Diary | null>(null);
  const [writing, setWriting] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState<Diary[]>([]);
  const [data, setData] = useState<Discovery | null>(null);
  const [revision, setRevision] = useState(0);
  const mode = data?.mode ?? null;
  const stream = useDiaryStream(!panel && !writing, revision);
  const streamRequest = useRef<AbortController | null>(null);
  useEffect(() => () => streamRequest.current?.abort(), []);
  const refreshDiscovery = useCallback(async (signal?: AbortSignal) => {
    const next = await getDiscovery(signal);
    if (signal?.aborted) return;
    next.places.forEach(p => registerPlace(p.place, false));
    setData(next);
  }, []);
  useEffect(() => {
    try { restorePlaces(); setSaved(readSavedDays()); }
    catch { setToast(t.readFailed); }
    const controller = new AbortController();
    refreshDiscovery(controller.signal).catch(() => { if (!controller.signal.aborted) setToast(t.dataFailed); });
    return () => controller.abort();
  }, [refreshDiscovery]);
  const diaries = useMemo(() => mode === "preview"
    ? [...saved, ...demoDiaries].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date))
    : [], [saved, mode]);
  const streamDiaries = useMemo(() => mode === "preview"
    ? [...saved.map(d => { const {id,placeId,cost,currency,score,createdAt,isLocal}=d; return {id,placeId,cost,currency,score,createdAt,isLocal,place:places.find(p=>p.id===d.placeId)!}; }), ...stream]
      .filter(d => d.place).sort((a,b)=>(b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0,STREAM_SIZE)
    : stream, [mode, saved, stream]);
  const summaries = useMemo(() => mode === "preview"
    ? places.map(place => ({ place, stats: diaryStats(diaries, [place.id]) })).filter(p => p.stats.count)
    : data?.places ?? [], [mode, diaries, data]);
  const counts = useMemo(() => Object.fromEntries(summaries.map(p => [p.place.id, p.stats.count])), [summaries]);
  const stats = useMemo(() => Object.fromEntries(summaries.map(p => [p.place.id, p.stats])), [summaries]);
  const [page, setPage] = useState<DiaryPage & { placeId: string }>({ placeId: "", diaries: [], nextCursor: null });
  const [pageBusy, setPageBusy] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const pageGeneration = useRef(0);
  useEffect(() => {
    const generation = ++pageGeneration.current;
    if (!panel || !selected || mode !== "database") return;
    const controller = new AbortController();
    const placeId = selected.id;
    setPageBusy(true); setPageFailed(false);
    setPage({ placeId, diaries: [], nextCursor: null });
    getDiaries(placeId, null, controller.signal).then(result => {
      if (!controller.signal.aborted && pageGeneration.current === generation) setPage({ ...result, placeId });
    }).catch(() => { if (!controller.signal.aborted) setPageFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setPageBusy(false); });
    return () => controller.abort();
  }, [panel, selected?.id, mode, revision]);
  const localDiaries = mode === "preview" ? diaries.filter(d => d.placeId === selected?.id)
    : page.placeId === selected?.id ? [...new Map([...(diary ? [diary] : []), ...page.diaries].map(d => [d.id, d])).values()] : diary ? [diary] : [];
  async function loadMore() {
    if (!selected || !page.nextCursor || pageBusy) return;
    const generation = pageGeneration.current;
    setPageBusy(true); setPageFailed(false);
    try {
      const next = await getDiaries(selected.id, page.nextCursor);
      if (pageGeneration.current === generation) setPage(current => ({ ...current, nextCursor: next.nextCursor,
        diaries: [...new Map([...current.diaries, ...next.diaries].map(d => [d.id, d])).values()] }));
    } catch { if (pageGeneration.current === generation) setPageFailed(true); }
    finally { if (pageGeneration.current === generation) setPageBusy(false); }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k" && !writing) {
        e.preventDefault();
        search.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [writing]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  function focusPlace(place: Place, open = false) {
    streamRequest.current?.abort();
    if (!ready) {
      setToast(t.globeWaiting);
      return;
    }
    setSelected(place);
    setPanel(open);
    setDiary(null);
    setSearchOpen(false);
    earth.current?.focus(place);
  }
  async function openStream(place: Place, item: StreamDiary) {
    if (!ready) { setToast(t.globeWaiting); return; }
    streamRequest.current?.abort();
    const controller = new AbortController(); streamRequest.current = controller;
    setSelected(place); setPanel(false); setDiary(null); setSearchOpen(false);
    // Fetch only the selected body while the camera flies to it.
    const loaded = item.isLocal ? Promise.resolve({ diary: saved.find(d=>d.id===item.id)! }) : getDiary(item.id, controller.signal);
    const arrived = new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, 3000);
      controller.signal.addEventListener("abort", done, { once: true });
      earth.current?.focus(place, false, done);
    });
    try {
      const [{ diary: day }] = await Promise.all([loaded, arrived]);
      if (!controller.signal.aborted) { setDiary(day); setPanel(true); }
    } catch { if (!controller.signal.aborted) setToast(t.dataFailed); }
  }
  async function save(input: DayInput, requestId: string) {
    const place = places.find(p => p.id === input.placeId)!;
    if (!mode) throw new Error("DATA_NOT_READY");
    const result = await publishDiary(input, place, locale, requestId);
    if ("preview" in result && mode !== "preview") throw new Error("DATA_MODE_CHANGED");
    const day = "preview" in result ? saveDay(input, locale) : result.diary;
    if (mode === "preview") setSaved(items => [day, ...items]);
    else {
      // Publishing has succeeded; a later refresh failure must not invite a second post.
      refreshDiscovery().catch(() => setToast(t.dataFailed));
      setRevision(v => v + 1);
    }
    setSelected(place);
    setPanel(true);
    setDiary(day);
    earth.current?.focus(place, true);
    setToast(mode === "preview" ? t.saved : t.published);
  }
  return (
    <main
      className={
        "experience" +
        (panel ? " reading" : "") + (searchOpen ? " searching" : "") +
        (!overview ? " zoomed-in" : "") +
        (selected ? " has-place" : "")
      }
    >
      <Earth
        ref={earth}
        paused={panel || writing || searchOpen || contactOpen}
        locale={locale}
        origin={origin}
        counts={counts}
        stats={stats}
        onReady={() => setReady(true)}
        onFailure={() => setMapFailed(true)}
        onOverviewChange={setOverview}
        onPlace={(id, open) => {
          const place = places.find((p) => p.id === id);
          if (place) {
            if (open) {
              setSelected(place);
              setPanel(true);
              setDiary(null);
            } else focusPlace(place);
          }
        }}
      />
      <LanguageSwitch/>
      <CommunityLinks open={contactOpen} onOpenChange={setContactOpen}/>
      {searchOpen && <button type="button" className="search-backdrop" aria-label={t.closeSearch}
        onPointerDown={e => { e.preventDefault(); e.stopPropagation(); }}
        onClick={e => {
          e.stopPropagation();
          search.current?.querySelector("input")?.blur();
          setSearchOpen(false);
        }}/>}
      <div className="explore-search" ref={search} inert={!overview}><PlacePicker revision={revision} counts={counts} onChoose={focusPlace} active={searchOpen} onActiveChange={setSearchOpen}/></div>
      <button className="write-orb" aria-label={t.write} onClick={() => { streamRequest.current?.abort(); setWriting(true); }}><Plus size={25}/></button>
      {!panel && !writing && <DiaryStream diaries={streamDiaries} onChoose={openStream}/>}
      {!ready && !mapFailed && (
        <div className="earth-loading" role="status">
          {t.globeLoading}
          <span />
        </div>
      )}
      <footer className="map-credits">
        <span><a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX IT Services GmbH</a></span>
        <span>(Contains modified Copernicus Sentinel data 2024)</span>
        <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="/sources" target="_blank" rel="noreferrer">{t.sources}</a></span>
      </footer>

      <DiaryDeck
        open={panel} onOpenChange={setPanel} place={selected}
        diaries={localDiaries} initialDiaryId={diary?.id}
        loading={mode === "database" && pageBusy} failed={mode === "database" && pageFailed}
        hasMore={mode === "database" && !!page.nextCursor} onLoadMore={loadMore}
        onRetry={() => setRevision(v => v + 1)}
        onWrite={() => { setPanel(false); setWriting(true); }}
      />
      <Compose
        open={writing}
        onOpenChange={setWriting}
        initialPlace={selected}
        onSave={save}
        mode={mode}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
