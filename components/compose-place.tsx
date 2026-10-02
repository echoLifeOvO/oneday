"use client";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import PlacePicker from "./place-picker";
import type { Place } from "@/lib/types";
import { useLocale } from "./locale-provider";
import { placeName, placeRegion, placeCountry } from "@/lib/i18n";

export default function ComposePlace({ place, open, onOpenChange, onChoose }: {
  place?: Place;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (place: Place) => void;
}) {
  const {locale,t}=useLocale();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [position, setPosition] = useState({ left: 0, width: 290, maxHeight: 280 });

  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const anchor = root.current;
    const paper = anchor.closest(".compose-letter");
    if (!paper) return;
    function fit() {
      const a = anchor.getBoundingClientRect();
      const p = paper!.getBoundingClientRect();
      const width = Math.min(290, p.width - 24);
      setPosition({
        left: Math.max(p.left + 12, Math.min(a.left, p.right - 12 - width)) - a.left,
        width,
        maxHeight: Math.min(280, p.bottom - a.bottom - 18),
      });
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(paper);
    const outside = (event: PointerEvent) => {
      if (!anchor.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside); };
  }, [open, onOpenChange]);

  function close() { onOpenChange(false); trigger.current?.focus(); }
  return <div className="location-picker" ref={root}
    onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) onOpenChange(false); }}
    onKeyDown={e => { if (open && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" className="detail-place" aria-label={t.choosePlace}
      aria-expanded={open} aria-controls={open ? id : undefined}
      title={place ? `${placeCountry(place,locale)} · ${placeRegion(place,locale)} · ${placeName(place,locale)}` : t.choosePlace}
      onClick={() => onOpenChange(!open)}
      onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); onOpenChange(true); } }}>
      {place ? <><span>{placeName(place,locale)}</span><ChevronDown size={12}/></> : <MapPin size={17}/>}
    </button>
    {open && <div id={id} className="location-dropdown" style={position}>
      <PlacePicker autoFocus placeholder={t.placePlaceholder} onClose={close}
        onChoose={p => { onChoose(p); close(); }}/>
    </div>}
  </div>;
}
