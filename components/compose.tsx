"use client";
import { randomId } from "@/lib/random-id";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import { costSchema } from "@/lib/day-input";
import { BODY_LIMIT, clipText, textLength } from "@/lib/limits";
import AmountInput from "./amount-input";
import { ApiError } from "@/lib/diary-api";
import MoodDial from "./mood-dial";
import { useLocale } from "./locale-provider";
import { currencyLabels } from "@/lib/i18n";
import ComposePlace from "./compose-place";
import { places, restorePlaces } from "@/lib/catalog";
import {
  COMPOSER_KEY,
  dayInputSchema,
  today,
  type DayInput,
} from "@/lib/local-days";
import type { Place, DataMode } from "@/lib/types";

type Buffer = {
  requestId: string;
  placeId: string;
  body: string;
  cost: number | null;
  currency: string;
  score: number;
};
const empty = (): Buffer => ({
  requestId: randomId(),
  placeId: "",
  body: "",
  cost: null,
  currency: "CNY",
  score: 50,
});
export default function Compose({
  open,
  onOpenChange,
  initialPlace,
  onSave,
  mode,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  initialPlace: Place | null;
  onSave: (input: DayInput, requestId: string) => Promise<void>;
  mode: DataMode | null;
}) {
  const {locale,t}=useLocale();
  const content = useRef<HTMLDivElement>(null);
  const currencyMenu = useRef<HTMLDivElement>(null);
  const [buffer, setBuffer] = useState<Buffer>(empty);
  const latestBuffer = useRef(buffer); latestBuffer.current = buffer;
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [choosingPlace, setChoosingPlace] = useState(false);
  const [choosingCurrency, setChoosingCurrency] = useState(false);
  const changePlaceOpen = useCallback((next: boolean) => {
    setChoosingPlace(next);
    if (next) setChoosingCurrency(false);
  }, []);
  useEffect(() => {
    let restored = empty();
    try {
      restorePlaces();
      const raw =
        localStorage.getItem(COMPOSER_KEY) ||
        localStorage.getItem("one-day-draft");
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === "object") {
          if (typeof d.requestId === "string" && /^[0-9a-f-]{36}$/i.test(d.requestId)) restored.requestId = d.requestId;
          if (places.some((p) => p.id === d.placeId))
            restored.placeId = d.placeId;
          if (typeof d.body === "string") restored.body = d.body;
          // Preserve words entered in the previous version, without separate fields.
          if (typeof d.title === "string" && d.title.trim())
            restored.body = d.title + "\n\n" + restored.body;
          if (typeof d.feeling === "string" && d.feeling.trim())
            restored.body += "\n\n" + d.feeling;
          const oldCost = typeof d.cost === "string" && d.cost.trim() ? Number(d.cost) : d.cost;
          if (costSchema.safeParse(oldCost).success) restored.cost = oldCost;
          if (textLength(restored.body) > BODY_LIMIT) {
            // Preserve the old long draft separately before applying the new cap.
            localStorage.setItem("one-day-composer-before-200-limit", raw);
            restored.body = clipText(restored.body);
          }
          if (["CNY", "USD", "EUR", "JPY", "GBP", "HKD"].includes(d.currency))
            restored.currency = d.currency;
          if (Number.isInteger(d.score) && d.score >= 0 && d.score <= 100)
            restored.score = d.score;
        }
      }
    } catch {
      /* The in-memory text still survives closing and reopening. */
    }
    setBuffer(restored);
    setLoaded(true);
  }, []);
  const persist = useCallback(() => {
    clearTimeout(persistTimer.current);
    try { localStorage.setItem(COMPOSER_KEY, JSON.stringify(latestBuffer.current)); } catch {}
  }, []);
  useEffect(() => {
    if (!loaded) return;
    if (!open) { persist(); return; }
    persistTimer.current = setTimeout(persist, 250);
    return () => clearTimeout(persistTimer.current);
  }, [buffer, loaded, open, persist]);
  useEffect(() => {
    if (!loaded) return;
    const hidden = () => { if (document.hidden) persist(); };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("pagehide", persist); document.removeEventListener("visibilitychange", hidden); };
  }, [loaded, persist]);
  useEffect(() => {
    if (open) {
      setError("");
      setChoosingPlace(false); setChoosingCurrency(false);
      if (initialPlace)
        setBuffer((b) => (b.placeId ? b : { ...b, placeId: initialPlace.id }));
    }
  }, [open, initialPlace]);
  useEffect(() => { if (choosingCurrency) currencyMenu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(); }, [choosingCurrency]);
  const update = useCallback(<K extends keyof Buffer>(key: K, value: Buffer[K]) => {
    setBuffer((b) => ({ ...b, [key]: value, requestId: randomId() }));
  }, []);
  const updateScore = useCallback((score: number) => update("score", score), [update]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || !loaded || !mode) return;
    const result = dayInputSchema.safeParse({
      ...buffer,
      score: Number(new FormData(e.currentTarget as HTMLFormElement).get("score")),
      date: today(),
      cost: buffer.cost ?? NaN,
    });
    if (!result.success) {
      const issue=result.error.issues[0];
      setError(issue?.path[0] === "placeId" ? t.missingPlace : issue?.path[0] === "body" ? (textLength(buffer.body)>BODY_LIMIT?t.longBody:t.missingBody) : issue?.path[0] === "cost" ? t.invalidCost : t.invalid);
      return;
    }
    submittingRef.current = true;
    setSubmitting(true); setError("");
    try {
      await onSave(result.data, buffer.requestId);
      const next = empty();
      clearTimeout(persistTimer.current);
      latestBuffer.current = next;
      setBuffer(next);
      // Prevent an old-version buffer from returning after this one has been saved.
      try {
        localStorage.setItem(COMPOSER_KEY, JSON.stringify(next));
        localStorage.removeItem("one-day-draft");
      } catch {}
      onOpenChange(false);
    } catch (error) {
      setError(error instanceof ApiError && error.code === "MODERATION_REJECTED" ? t.moderationRejected : error instanceof ApiError && error.code === "MODERATION_UNAVAILABLE" ? t.moderationUnavailable : error instanceof ApiError && error.status === 429 ? t.rateLimited : t.saveFailed);
    } finally { submittingRef.current = false; setSubmitting(false); }
  }
  const selectedPlace = places.find(p => p.id === buffer.placeId);
  const currencies = Object.entries(currencyLabels[locale]).map(([code,label])=>({code,label}));
  return <Dialog.Root open={open} onOpenChange={next => { if (!submittingRef.current) onOpenChange(next); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="focus-overlay" />
      <Dialog.Content ref={content} className="compose-letter" aria-describedby={undefined}
        onEscapeKeyDown={e => { if (choosingPlace || choosingCurrency) e.preventDefault(); }}
        onOpenAutoFocus={e => { e.preventDefault(); content.current?.focus(); }}>
        <Dialog.Close className="icon-button letter-close" aria-label={t.backHome}><X size={21}/></Dialog.Close>
        <Dialog.Title className="letter-title">{t.composeTitle}</Dialog.Title>
        <form onSubmit={submit} aria-busy={submitting}>
          <fieldset disabled={submitting} className="compose-fields">
          <MoodDial value={buffer.score} onChange={updateScore} disabled={submitting}/>
          <div className="letter-details">
            <div className="letter-detail-row"><span>{t.todayIn}</span>
              <ComposePlace place={selectedPlace} open={choosingPlace} onOpenChange={changePlaceOpen}
                onChoose={p => update("placeId", p.id)}/>
            </div>
            <div className="letter-detail-row"><label htmlFor="day-cost">{t.todayCost}</label>
              <div className="detail-cost"><AmountInput value={buffer.cost} onChange={value => update("cost", value)} label={t.costLabel}/>
                <div className="currency-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setChoosingCurrency(false); }}>
                  <button type="button" aria-label={t.chooseCurrency} aria-haspopup="listbox" aria-expanded={choosingCurrency}
                    onClick={() => { setChoosingCurrency(v => !v); setChoosingPlace(false); }}
                    onKeyDown={e => { if(e.key === "ArrowDown"){e.preventDefault();setChoosingCurrency(true);} }}>
                    {currencies.find(c => c.code === buffer.currency)?.label}<ChevronDown size={11}/>
                  </button>
                  {choosingCurrency && <div ref={currencyMenu} className="currency-dropdown" role="listbox" aria-label={t.currency}
                    onKeyDown={e => {
                      if(e.key === "Escape"){e.preventDefault();e.stopPropagation();setChoosingCurrency(false);(e.currentTarget.previousElementSibling as HTMLButtonElement)?.focus();}
                      if(e.key === "ArrowDown" || e.key === "ArrowUp"){
                        e.preventDefault();const buttons=Array.from(e.currentTarget.querySelectorAll('button'));
                        const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
                        buttons[(at+(e.key === "ArrowDown" ? 1 : buttons.length-1))%buttons.length]?.focus();
                      }
                    }}>
                    {currencies.map(c => <button type="button" role="option" key={c.code} aria-selected={buffer.currency === c.code}
                      onClick={e => { update("currency", c.code); setChoosingCurrency(false);(e.currentTarget.parentElement?.previousElementSibling as HTMLButtonElement)?.focus(); }}>{c.label}{c.label!==c.code && <small>{c.code}</small>}</button>)}
                  </div>}
                </div>
              </div>
            </div>
          </div>
          <div className="letter-body">
            <textarea className="letter-writing" aria-label={t.bodyLabel}
              placeholder={t.bodyPlaceholder} value={buffer.body}
              onChange={e => update("body", clipText(e.target.value))} required maxLength={BODY_LIMIT * 2}/>
            <span className="letter-count" aria-live="polite">{textLength(buffer.body)} / {BODY_LIMIT}</span>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="letter-footer">
            <div className="letter-publish"><button className="primary-button" type="submit" disabled={!loaded || !mode || submitting}>{submitting ? t.publishing : t.publish}</button>{mode === "preview" && <span>{t.localPreview}</span>}</div>
          </footer>
          </fieldset>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
