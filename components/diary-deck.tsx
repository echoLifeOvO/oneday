"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, MessageCircle, Plus, X } from "lucide-react";
import { formatMoney, placeName, placeCountry, placeRegion } from "@/lib/i18n";
import { useLocale } from "./locale-provider";
import type { Diary, Place } from "@/lib/types";
import DiaryReplies from "./diary-replies";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  place: Place | null;
  diaries: Diary[];
  initialDiaryId?: string;
  onWrite: () => void;
  loading?: boolean;
  failed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
};
export default function DiaryDeck({ open, onOpenChange, place, diaries, initialDiaryId, onWrite, loading, failed, hasMore, onLoadMore, onRetry }: Props) {
  const {locale,t}=useLocale();
  const money=(amount:number,currency:string)=>formatMoney(amount,currency,locale);
  const name=place?placeName(place,locale):"";
  const country=place?placeCountry(place,locale):"";
  const region=place?placeRegion(place,locale):"";
  const [index, setIndex] = useState(0);
  const [listing, setListing] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  const listPosition = useRef(0);
  const direction = useRef(0);
  const advanceAfterLoad = useRef<number | null>(null);
  const slide = useRef<Animation | null>(null);
  const [comments, setComments] = useState(false);
  const [repliesDiaryId, setRepliesDiaryId] = useState<string | null>(null);
  const [newComments, setNewComments] = useState<Record<string, number>>({});
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const card = useRef<HTMLElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const wheel = useRef({ value: 0, used: false, last: 0, direction: 0 });
  useLayoutEffect(() => {
    if (open) {
      setListing(!initialDiaryId);
      listPosition.current = 0;
      direction.current = 0;
      wheel.current = { value: 0, used: false, last: 0, direction: 0 };
      setIndex(Math.max(0, diaries.findIndex(d => d.id === initialDiaryId)));
      setComments(false);
      setRepliesDiaryId(null);
      setNewComments({});
      advanceAfterLoad.current = null;
    }
  }, [open, place?.id, initialDiaryId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const target = advanceAfterLoad.current;
    if (target !== null && diaries.length > target) {
      advanceAfterLoad.current = null; direction.current = 1; setIndex(target); setComments(false);
    } else if (failed || (!loading && !hasMore)) advanceAfterLoad.current = null;
  }, [diaries.length, loading, failed, hasMore]);
  useLayoutEffect(() => {
    if (!open) return;
    if (listing) { if (list.current) { list.current.scrollTop = listPosition.current; list.current.focus({ preventScroll: true }); } return; }
    card.current?.focus({ preventScroll: true });
    if (paper.current) paper.current.scrollTop = 0;
    slide.current?.cancel();
    if (direction.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      slide.current = card.current?.animate([
        { transform: `translateX(${direction.current * 38}px)`, opacity: .75 },
        { transform: "translateX(0)", opacity: 1 },
      ], { duration: 180, easing: "cubic-bezier(.2,.75,.3,1)" }) ?? null;
    }
    return () => slide.current?.cancel();
  }, [open, index, listing]);
  const activeIndex = Math.min(index, Math.max(0, diaries.length - 1));
  const day = diaries[activeIndex];
  const commentCount = day ? Math.max(day.commentCount ?? day.comments.length, newComments[day.id] ?? 0) : 0;
  function turn(delta: number) {
    if (delta > 0 && activeIndex === diaries.length - 1 && hasMore) {
      if (!loading) { advanceAfterLoad.current = diaries.length; onLoadMore?.(); }
      return;
    }
    const next = Math.max(0, Math.min(diaries.length - 1, activeIndex + delta));
    if (next === activeIndex) return;
    direction.current = delta;
    setIndex(next);
    setComments(false);
  }
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="deck-overlay" />
        <Dialog.Content
          className={listing ? "library-stage" : "diary-stage"}
          data-replies={comments && !listing}
          aria-describedby="deck-description"
          onCloseAutoFocus={e => e.preventDefault()}
          onOpenAutoFocus={e => { e.preventDefault(); (listing ? list.current : card.current)?.focus(); }}
          onEscapeKeyDown={e => {
            if (comments) { e.preventDefault(); setComments(false); card.current?.focus({ preventScroll: true }); }
            else if (!listing) { e.preventDefault(); setListing(true); }
          }}
          onKeyDown={e => {
            if ((e.target as HTMLElement).closest("input, textarea")) return;
            if (listing || comments) return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              turn(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
          onWheel={e => {
            if (listing || comments) return;
            if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
            const now = performance.now();
            const intent = Math.sign(e.deltaX);
            if (now - wheel.current.last > 140 || intent !== wheel.current.direction) {
              wheel.current.value = 0;
              wheel.current.used = false;
            }
            wheel.current.direction = intent;
            wheel.current.last = now;
            if (wheel.current.used) return;
            wheel.current.value += e.deltaX;
            if (Math.abs(wheel.current.value) > 45) {
              turn(Math.sign(wheel.current.value));
              wheel.current.value = 0;
              wheel.current.used = true;
            }
          }}
        >
          <Dialog.Title className="sr-only">{name} · {listing ? t.diaryList : comments ? t.responses : t.diaryCard}</Dialog.Title>
          <Dialog.Description id="deck-description" className="sr-only">
            {t.deckHelp}
          </Dialog.Description>
          <section className="diary-library" hidden={!listing}>
            <header className="library-heading"><div><small>{country} · {region}</small><h2>{name}</h2></div><Dialog.Close className="icon-button" aria-label={t.closeList}><X size={20}/></Dialog.Close></header>
            <div className="library-scroll" ref={list} tabIndex={-1} aria-label={t.diaryList} onScroll={e => { if (listing) listPosition.current = e.currentTarget.scrollTop; }}>
              {diaries.map((item, i) => <button type="button" className="diary-list-row" key={item.id} onClick={() => { direction.current = 0; setIndex(i); setComments(false); setListing(false); }}>
                <span className="list-row-date"><time>{item.date}</time>{item.isDemo && <small>{t.example}</small>}</span>
                <span className="list-row-score">{item.score}<small>{t.points}</small></span>
                <span className="list-row-cost">{money(item.cost, item.currency)}</span>
              </button>)}
              {loading && <p className="diary-list-status" role="status">{t.dataLoading}</p>}
              {failed && <div className="diary-list-status" role="alert">{t.dataFailed} <button className="text-button" onClick={onRetry}>{t.retry}</button></div>}
              {hasMore && !failed && <button className="text-button diary-list-status" disabled={loading} onClick={onLoadMore}>{t.loadMore}</button>}
              {!diaries.length && !loading && !failed && <div className="empty-diary"><p>{t.emptyDiary}</p><button className="text-button" onClick={onWrite}><Plus size={16}/>{t.writeMine}</button></div>}
            </div>
          </section>
          <div className="diary-detail" hidden={listing}>
          <div className="deck-context"><span>{country} · {region}</span><strong>{name}</strong></div>
          <div className="deck-cards">
            <article ref={card} tabIndex={-1} className="floating-diary"
              onPointerDown={e => {
                if (comments || (e.target as HTMLElement).closest("button, input, textarea")) return;
                pointer.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerUp={e => {
                const start = pointer.current;
                pointer.current = null;
                if (!start || comments) return;
                const dx = e.clientX - start.x, dy = e.clientY - start.y;
                if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
              }}
              onPointerCancel={() => { pointer.current = null; }}>
              <header className="diary-topline">
                <button type="button" className="back-to-list" aria-label={comments ? t.backDiary : t.backList} onClick={() => {
                  if (comments) { setComments(false); card.current?.focus({ preventScroll: true }); }
                  else setListing(true);
                }}><ArrowLeft size={16}/><span>{comments ? t.backDiary : t.list}</span></button>
                {comments ? <span className="replies-heading">{t.responses} · {commentCount}</span> : <time>{day?.date || t.write}</time>}
                <Dialog.Close className="icon-button" aria-label={t.closeCard}><X size={20} /></Dialog.Close>
              </header>
              {day ? <>
                <div className="diary-paper-scroll" ref={paper} hidden={comments}>
                  <p className="diary-prose">{day.body}</p>
                  <div className="diary-signature">{day.nickname}{(day.isDemo || day.isLocal) && <span>{day.isDemo ? t.fictional : t.localRecord}</span>}</div>
                </div>
                <footer className="diary-bottomline" hidden={comments}>
                  <div><small>{t.costLabel}</small><strong>{money(day.cost, day.currency)}</strong></div>
                  <div><small>{t.moodLabel}</small><strong>{day.score}<em> / 100</em></strong></div>
                  <button className="response-toggle" aria-label={`${t.showResponses} · ${commentCount}`} onClick={() => { setRepliesDiaryId(day.id); setComments(true); }}>
                    <MessageCircle size={16} /><span>{t.responses} · {commentCount}</span>
                  </button>
                </footer>
                {repliesDiaryId === day.id && <DiaryReplies key={day.id} day={day} active={comments && !listing} onAdded={() => setNewComments(current => ({...current,[day.id]:Math.max(current[day.id] ?? 0,day.commentCount ?? day.comments.length)+1}))}/>}
              </> : <div className="empty-diary">
                <p>{loading ? t.dataLoading : failed ? t.dataFailed : t.emptyDiary}</p>
                {!loading && <button className="text-button" onClick={failed ? onRetry : onWrite}>{failed ? t.retry : t.writeMine}</button>}
              </div>}
            </article>
          </div>
          {(diaries.length > 1 || hasMore) && <nav className="deck-navigation" data-inactive={comments} inert={comments} aria-label={t.turnDiary}>
            <button aria-label={t.previous} disabled={activeIndex === 0} onClick={() => turn(-1)}><ArrowLeft size={19} /></button>
            <span aria-live="polite">{activeIndex + 1}<i> / {diaries.length}</i></span>
            <button aria-label={t.next} disabled={activeIndex === diaries.length - 1 && (!hasMore || loading)} onClick={() => turn(1)}><ArrowRight size={19} /></button>
          </nav>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
