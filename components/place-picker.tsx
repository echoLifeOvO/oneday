"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { findPlaces, places, registerPlace } from "@/lib/catalog";
import type { Place } from "@/lib/types";
import { useLocale } from "./locale-provider";
import { diaryCount, placeName, placeRegion, placeCountry } from "@/lib/i18n";
import { getRecentPlaces } from "@/lib/diary-api";
import type { RecentPlace } from "@/lib/types";

const searchCache = new Map<string, { at: number; places: Place[] }>();

export default function PlacePicker({ onChoose, placeholder, autoFocus = false, onClose, counts, active, onActiveChange, revision = 0 }: {
  onChoose: (place: Place) => void; placeholder?: string; autoFocus?: boolean;
  onClose?: () => void; counts?: Record<string, number>;
  active?: boolean;
  onActiveChange?: (active: boolean) => void;
  revision?: number;
}) {
  const {locale,t}=useLocale();
  const optionsId = useId();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState(0);
  const [composing, setComposing] = useState(false);
  const [remote, setRemote] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [localFocused, setLocalFocused] = useState(autoFocus);
  const focused = active ?? localFocused;
  const setFocused = useCallback((next: boolean) => {
    setLocalFocused(next);
    onActiveChange?.(next);
  }, [onActiveChange]);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [recentBusy, setRecentBusy] = useState(false);
  const [recentFailed, setRecentFailed] = useState(false);
  const discovery = counts !== undefined;
  const emptyQuery = !query.trim();
  useEffect(() => {
    if (!discovery || !focused || !emptyQuery) return;
    const controller = new AbortController();
    setRecentBusy(true); setRecentFailed(false);
    getRecentPlaces(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      result.places.forEach(p => registerPlace(p.place, false));
      setRecent(result.places);
    }).catch(() => { if (!controller.signal.aborted) { setRecent([]); setRecentFailed(true); } })
      .finally(() => { if (!controller.signal.aborted) setRecentBusy(false); });
    return () => controller.abort();
  }, [discovery, focused, emptyQuery, revision]);
  const recommended = counts ? recent.map(p => p.place) : places.slice(-5).reverse();
  const local = query.trim() ? findPlaces(query) : recommended;
  const matches = [...new Map([...local, ...(query.trim() ? remote : [])].map(p => [p.id, p])).values()].slice(0, 8);
  useEffect(() => {
    setRemote([]); setError(""); setIndex(0);
    const key = `${locale}:${query.trim().toLocaleLowerCase()}`;
    if (!focused || composing || query.trim().length < 2) { setBusy(false); return; }
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.at < 86400000) { setRemote(cached.places); setBusy(false); return; }
    const abort = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}&lang=${locale}`, { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) {
          if (!abort.signal.aborted) setError(t.searchFailed);
          return;
        }
        if (!abort.signal.aborted) {
          searchCache.set(key, { at: Date.now(), places: data.places });
          if(searchCache.size > 100) searchCache.delete(searchCache.keys().next().value!);
          setRemote(data.places);
        }
      } catch {
        if (!abort.signal.aborted) setError(t.searchFailed);
      } finally { if (!abort.signal.aborted) setBusy(false); }
    }, submitted ? 0 : 280);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, focused, composing, submitted,locale,t.searchFailed]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setFocused(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [setFocused]);
  function choose(place: Place) {
    try { registerPlace(place); }
    catch { setError(t.placeSaveFailed); return; }
    setFocused(false); setQuery(""); setRemote([]); onChoose(place);
  }
  return <div className="place-picker" ref={root}>
    <div className="place-input-line"><Search size={17}/><input ref={input} role="combobox" aria-label={t.searchLabel} aria-expanded={focused} aria-controls={optionsId} aria-autocomplete="list"
      aria-activedescendant={focused && matches[index] ? `${optionsId}-${matches[index].id}` : undefined}
      value={query} maxLength={80} placeholder={placeholder ?? t.searchPlaceholder} autoComplete="off" onFocus={() => setFocused(true)} onClick={() => setFocused(true)}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
      onChange={e => { setFocused(true); setQuery(e.target.value); setSubmitted(0); }} onKeyDown={e => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setFocused(false); onClose?.(); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setFocused(true); setIndex(i => Math.max(0, Math.min(matches.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))); }
        if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); if (matches[index]) choose(matches[index]); else setSubmitted(v => v + 1); }
      }}/>{onClose && <button type="button" className="icon-button" aria-label={t.closePlace} onClick={onClose}><X size={17}/></button>}</div>
    {focused && <div className="place-options" id={optionsId} role="listbox" aria-label={t.searchResults}>
      {!query.trim() && counts && <p className="place-options-label">{t.suggestions}</p>}
      {matches.map((p, i) => <button type="button" role="option" aria-selected={index === i} id={`${optionsId}-${p.id}`} key={p.id} onPointerMove={() => setIndex(i)} onClick={() => choose(p)}>
        <span>{placeName(p,locale)}<small>{[placeCountry(p,locale), placeRegion(p,locale)].filter(Boolean).join(" · ")}</small></span>{counts && <em>{diaryCount((!query.trim() ? recent.find(r => r.place.id === p.id)?.count : undefined) ?? counts[p.id] ?? 0,locale)}</em>}
      </button>)}
      {busy && <p role="status">{t.searching}</p>}
      {error && <p role="status">{error}</p>}
      {discovery && emptyQuery && recentBusy && <p role="status">{t.dataLoading}</p>}
      {discovery && emptyQuery && recentFailed && <p role="status">{t.dataFailed}</p>}
      {!busy && !error && !(discovery && emptyQuery && (recentBusy || recentFailed)) && !matches.length && <p>{discovery && emptyQuery ? t.emptyDiary : t.noPlaces}</p>}
    </div>}
  </div>;
}
