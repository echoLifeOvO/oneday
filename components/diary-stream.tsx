"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatMoney, placeName, streamSentence } from "@/lib/i18n";
import { useLocale } from "./locale-provider";
import type { StreamDiary, Place } from "@/lib/types";

export default function DiaryStream({ diaries, onChoose }: { diaries: StreamDiary[]; onChoose: (place: Place, diary: StreamDiary) => void }) {
  const {locale,t}=useLocale();
  const split = (items: StreamDiary[]) => [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
  const pending = useRef(diaries);
  const host = useRef<HTMLElement>(null);
  const [rows, setRows] = useState(() => split(diaries));
  const [copies, setCopies] = useState([2, 2]);
  useEffect(() => {
    pending.current = diaries;
    setRows(current => !current.flat().length || !diaries.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? split(diaries) : current);
  }, [diaries]);
  useLayoutEffect(() => {
    const section = host.current;
    if (!section) return;
    // Safari can retain the zero-width transform of an animation started before
    // the first network response. Measure real content before starting a track.
    const measure = () => section.querySelectorAll<HTMLElement>(".stream-track").forEach((track, line) => {
      const copy = track.querySelector<HTMLElement>(".stream-copy");
      const distance = copy?.getBoundingClientRect().width ?? 0;
      if (!distance) return;
      track.style.setProperty("--travel", `${-distance}px`);
      track.style.setProperty("--duration", `${distance / (line ? 33 : 38)}s`);
      track.dataset.ready = "true";
      const required = Math.max(2, Math.ceil(section.clientWidth / distance) + 1);
      setCopies(current => current[line] === required ? current : current.map((count, i) => i === line ? required : count));
    });
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    section.querySelectorAll(".stream-copy:first-child").forEach(copy => observer.observe(copy));
    measure();
    const resume = () => {
      if (document.hidden) return;
      measure();
      section.getAnimations({ subtree: true }).forEach(animation => {
        if (animation.playState === "paused" || animation.playState === "idle") animation.play();
      });
    };
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      observer.disconnect();
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [rows, locale]);
  return <section className="diary-stream" ref={host} aria-label={t.stream}>
    {rows.map((row, line) => row.length > 0 && <div className="stream-lane" key={line}>
      <div className="stream-track" onAnimationIteration={() => setRows(current => current.map((items, i) => i === line ? split(pending.current)[i] : items))}
        style={{ "--duration": `${60 + line * 12}s` } as React.CSSProperties}>
        {Array.from({ length: copies[line] }, (_, copy) => <div className="stream-copy" key={copy} aria-hidden={copy > 0 || undefined}>
          {row.map(day => {
            const p = day.place;
            return p && <button key={day.id} tabIndex={copy ? -1 : 0} onClick={e => { e.currentTarget.blur(); onChoose(p, day); }}
              aria-label={streamSentence(placeName(p,locale),formatMoney(day.cost,day.currency,locale),day.score,locale)}>
              <span className="stream-sentence">{locale==="zh"?"在":"A day in "}<span className="stream-place">{placeName(p,locale)}</span>{locale==="zh"?"花费了":": spent "}<span className="stream-cost">{formatMoney(day.cost,day.currency,locale)}</span>{locale==="zh"?"，获得了":", rated the experience "}<strong>{day.score}{locale==="zh"?"分":"/100"}</strong>{locale==="zh"?"的生活体验":""}</span>{day.isDemo && <small>{t.example}</small>}
            </button>;
          })}
        </div>)}
      </div>
    </div>)}
  </section>;
}
