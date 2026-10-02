"use client";
import { randomId } from "@/lib/random-id";
import { useEffect, useRef, useState } from "react";
import type { Diary, CommentPage } from "@/lib/types";
import { ApiError, getComments, publishComment } from "@/lib/diary-api";
import { bodySchema } from "@/lib/day-input";
import { BODY_LIMIT, clipText, textLength } from "@/lib/limits";
import { useLocale } from "./locale-provider";
export default function DiaryReplies({ day, onAdded }: { day: Diary; onAdded: () => void }) {
  const { locale, t } = useLocale();
  const local = day.isDemo || day.isLocal;
  const [page, setPage] = useState<CommentPage>({ comments: local ? day.comments : [], nextCursor: null });
  const [busy, setBusy] = useState(!local), [error, setError] = useState("");
  const [body, setBody] = useState(""), [sending, setSending] = useState(false);
  const requestId = useRef(randomId()), pending = useRef(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    setBusy(true); setError("");
    getComments(day.id, null, controller.signal).then(data => { if (!controller.signal.aborted) setPage(data); })
      .catch(() => { if (!controller.signal.aborted) setError(t.dataFailed); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [day.id, local, reload, t.dataFailed]);
  async function more() {
    if (busy || !page.nextCursor) return;
    setBusy(true); setError("");
    try { const next = await getComments(day.id, page.nextCursor);
      setPage(current => ({ nextCursor: next.nextCursor, comments: [...new Map([...current.comments, ...next.comments].map(c => [c.id,c])).values()] }));
    } catch { setError(t.dataFailed); } finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !bodySchema.safeParse(body).success) return;
    pending.current = true; setSending(true); setError("");
    try {
      const result = await publishComment(day.id, body, requestId.current, locale);
      setPage(p => ({ ...p, comments: [result.comment, ...p.comments.filter(c => c.id !== result.comment.id)] }));
      setBody(""); requestId.current = randomId(); onAdded();
    } catch (error) { setError(error instanceof ApiError && error.code === "MODERATION_REJECTED" ? t.moderationRejected : error instanceof ApiError && error.code === "MODERATION_UNAVAILABLE" ? t.moderationUnavailable : error instanceof ApiError && error.status === 429 ? t.rateLimited : t.saveFailed); }
    finally { pending.current = false; setSending(false); }
  }
  return <section className="diary-responses" aria-label={t.responses}>
    {page.comments.map(comment => <div key={comment.id}><small>{comment.nickname}</small><p>{comment.body}</p></div>)}
    {!page.comments.length && !busy && !error && <p>{t.noResponses}</p>}
    {busy && <p className="reply-status" role="status">{t.dataLoading}</p>}
    {error && <p className="reply-status" role="alert">{error} {!sending && <button className="text-button" onClick={() => setReload(n => n+1)}>{t.retry}</button>}</p>}
    {page.nextCursor && <button className="text-button" disabled={busy} onClick={more}>{t.loadMore}</button>}
    {!local && <form className="reply-form" onSubmit={submit}>
      <textarea aria-label={t.reply} placeholder={t.replyPlaceholder} value={body} maxLength={BODY_LIMIT*2} disabled={sending}
        onChange={e => { setBody(clipText(e.target.value)); requestId.current = randomId(); }}/>
      <small className="reply-status">{textLength(body)} / {BODY_LIMIT}</small>
      <button className="text-button" disabled={sending || !body.trim()} type="submit">{sending ? t.publishing : t.reply}</button>
    </form>}
  </section>;
}
