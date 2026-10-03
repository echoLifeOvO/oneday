"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatMoney, placeName, streamSentence } from "@/lib/i18n";
import { streamFlight, uniqueStream } from "@/lib/stream-layout";
import { useLocale } from "./locale-provider";
import type { StreamDiary, Place } from "@/lib/types";

export default function DiaryStream({ diaries, onChoose }: { diaries: StreamDiary[]; onChoose: (place: Place, diary: StreamDiary) => void }) {
  const { locale, t } = useLocale();
  const pending = useRef(uniqueStream(diaries));
  const host = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [batch, setBatch] = useState(() => ({ diaries: pending.current, cycle: 0 }));
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    pending.current = uniqueStream(diaries);
    setBatch(current => !current.diaries.length || !pending.current.length || reducedMotion
      ? { diaries: pending.current, cycle: current.cycle + 1 } : current);
  }, [diaries, reducedMotion]);

  useLayoutEffect(() => {
    const section = host.current, element = track.current;
    if (!section || !element || !batch.diaries.length || reducedMotion) return;
    let animation: Animation | null = null;
    let width = section.clientWidth, contentWidth = element.offsetWidth;
    let disposed = false;
    function fly(currentX?: number) {
      if (!section || !element) return;
      const flight = streamFlight(section.clientWidth, element.offsetWidth, currentX);
      if (animation) { animation.onfinish = null; animation.cancel(); }
      animation = element.animate([
        { transform: `translate3d(${flight.start}px,0,0)` },
        { transform: `translate3d(${flight.end}px,0,0)` },
      ], { duration: flight.duration, easing: "linear", fill: "both" });
      // Replace the entire batch only after every old item has left the screen.
      // No copies, overlapping generations, or mid-flight polling resets.
      animation.onfinish = () => { if (!disposed) setBatch(current => ({ diaries: pending.current, cycle: current.cycle + 1 })); };
      if (document.hidden) animation.pause();
    }
    const measure = () => {
      if (width === section.clientWidth && contentWidth === element.offsetWidth) return;
      const x = element.getBoundingClientRect().left - section.getBoundingClientRect().left;
      width = section.clientWidth; contentWidth = element.offsetWidth;
      fly(x);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(section); observer.observe(element);
    fly();
    const resume = () => {
      if (document.hidden) animation?.pause();
      else { measure(); if (animation?.playState === "paused") animation.play(); }
    };
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true; observer.disconnect();
      if (animation) { animation.onfinish = null; animation.cancel(); }
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [batch, locale, reducedMotion]);

  const rows = [batch.diaries.filter((_, i) => i % 2 === 0), batch.diaries.filter((_, i) => i % 2 === 1)];
  return <section className="diary-stream" ref={host} aria-label={t.stream}>
    <div className="stream-track" ref={track} data-cycle={batch.cycle}>
      {rows.map((row, line) => row.length > 0 && <div className="stream-lane" key={line}>
        <div className="stream-copy">
          {row.map(day => <button key={day.id} data-diary-id={day.id} onClick={e => { e.currentTarget.blur(); onChoose(day.place, day); }}
            aria-label={streamSentence(placeName(day.place, locale), formatMoney(day.cost, day.currency, locale), day.score, locale)}>
            <span className="stream-sentence">{locale === "zh" ? "在" : "A day in "}<span className="stream-place">{placeName(day.place, locale)}</span>{locale === "zh" ? "花费了" : ": spent "}<span className="stream-cost">{formatMoney(day.cost, day.currency, locale)}</span>{locale === "zh" ? "，获得了" : ", rated the experience "}<strong>{day.score}{locale === "zh" ? "分" : "/100"}</strong>{locale === "zh" ? "的生活体验" : ""}</span>{day.isDemo && <small>{t.example}</small>}
          </button>)}
        </div>
      </div>)}
    </div>
  </section>;
}
