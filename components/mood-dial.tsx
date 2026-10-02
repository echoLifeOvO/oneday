"use client";
import { memo, useEffect, useRef, useState } from "react";
import { moodLabel } from "@/lib/i18n";
import { scoreAtPosition, scoreForKey } from "@/lib/score-slider";
import { useLocale } from "./locale-provider";
import MoodCharacter from "./mood-character";

export default memo(function MoodDial({ value, onChange, disabled = false }: { value: number; onChange: (score: number) => void; disabled?: boolean }) {
  const {locale,t}=useLocale();
  const [display, setDisplay] = useState(value);
  const current = useRef(value), frame = useRef(0);
  const drag = useRef<{ id: number; left: number; width: number } | null>(null);
  const track = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (drag.current) return;
    current.current = value; setDisplay(value);
    if (input.current) input.current.value = String(value);
  }, [value]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const preview = (score: number) => {
    current.current = score;
    // Form submission always reads the latest finger position, even before RAF.
    if (input.current) input.current.value = String(score);
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setDisplay(current.current); });
  };
  const commit = () => {
    drag.current = null;
    cancelAnimationFrame(frame.current); frame.current = 0;
    setDisplay(current.current);
    if (current.current !== value) onChange(current.current);
  };
  return <div className="mood-control">
    <MoodCharacter score={display}/>
    <input ref={input} name="score" type="hidden" defaultValue={value}/>
    <div className="mood-slider" role="slider" tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled} aria-valuemin={0} aria-valuemax={100} aria-valuenow={display}
      aria-label={t.moodSlider} aria-valuetext={`${display} ${t.points}, ${moodLabel(display,locale)}`}
      style={{ "--score": `${display}%` } as React.CSSProperties}
      onPointerDown={e => {
        if (disabled || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        const bounds = track.current!.getBoundingClientRect();
        drag.current = { id: e.pointerId, left: bounds.left, width: bounds.width };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus({ preventScroll: true });
        preview(scoreAtPosition(e.clientX, bounds.left, bounds.width));
      }}
      onPointerMove={e => {
        const active = drag.current;
        if (disabled || !active || active.id !== e.pointerId) return;
        e.preventDefault();
        preview(scoreAtPosition(e.clientX, active.left, active.width));
      }}
      onPointerUp={e => {
        const active = drag.current;
        if (!active || active.id !== e.pointerId) return;
        preview(scoreAtPosition(e.clientX, active.left, active.width));
        commit();
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={e => { if (drag.current?.id === e.pointerId) commit(); }}
      onLostPointerCapture={e => { if (drag.current?.id === e.pointerId) commit(); }}
      onBlur={commit}
      onKeyDown={e => {
        if (disabled) return;
        const next = scoreForKey(current.current, e.key);
        if (next === null) return;
        e.preventDefault(); preview(next); commit();
      }}>
      <span ref={track} className="mood-slider-track" aria-hidden="true"><span className="mood-slider-thumb"/></span>
    </div>
    <span className="mood-caption"><strong>{display}</strong><span>{moodLabel(display,locale)}</span></span>
  </div>;
});
