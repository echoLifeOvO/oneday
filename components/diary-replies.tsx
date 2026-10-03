"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { randomId } from "@/lib/random-id";
import type { Diary, Comment, CommentPage } from "@/lib/types";
import { ApiError, getComments, publishComment } from "@/lib/diary-api";
import { bodySchema } from "@/lib/day-input";
import { BODY_LIMIT, clipText, textLength } from "@/lib/limits";
import { useLocale } from "./locale-provider";
import { useReplyViewport } from "./use-reply-viewport";

export default function DiaryReplies({ day, active, onAdded }: { day: Diary; active: boolean; onAdded: () => void }) {
  const { locale, t } = useLocale();
  const local = Boolean(day.isDemo || day.isLocal);
  const [page, setPage] = useState<CommentPage>({ comments: local ? day.comments : [], nextCursor: null });
  const [busy, setBusy] = useState(!local);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sendError, setSendError] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(randomId());
  const pending = useRef(false);
  const posted = useRef<Comment[]>([]);
  const paging = useRef<AbortController | null>(null);
  const feedbackId = useId();
  const showNewest = useReplyViewport(active, list, input);

  useEffect(() => {
    if (local) return;
    const controller = new AbortController();
    setBusy(true); setLoadFailed(false);
    getComments(day.id, null, controller.signal).then(data => {
      if (!controller.signal.aborted) setPage({ ...data, comments: [...new Map([...posted.current, ...data.comments].map(c => [c.id, c])).values()] });
    }).catch(() => { if (!controller.signal.aborted) setLoadFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); paging.current?.abort(); };
  }, [day.id, local, reload]);

  useLayoutEffect(() => {
    if (active) list.current?.focus({ preventScroll: true });
  }, [active]);

  // Keep the text field compact, including when the viewport changes width.
  useLayoutEffect(() => {
    const field = input.current;
    if (!active || !field) return;
    function resize() {
      if (!field) return;
      field.style.height = "0px";
      field.style.height = `${field.scrollHeight}px`;
    }
    resize();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) { width = field.clientWidth; resize(); }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [active, body]);

  useLayoutEffect(() => {
    if (!active || !latestId) return;
    if (list.current) list.current.scrollTop = 0;
    const timer = window.setTimeout(() => setLatestId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [active, latestId]);

  async function more() {
    if (busy || !page.nextCursor) return;
    const controller = new AbortController();
    paging.current = controller;
    setBusy(true); setLoadFailed(false);
    try {
      const next = await getComments(day.id, page.nextCursor, controller.signal);
      if (!controller.signal.aborted) setPage(current => ({ nextCursor: next.nextCursor, comments: [...new Map([...current.comments, ...next.comments].map(c => [c.id, c])).values()] }));
    } catch { if (!controller.signal.aborted) setLoadFailed(true); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !bodySchema.safeParse(body).success) return;
    pending.current = true; setSending(true); setSendError("");
    try {
      const result = await publishComment(day.id, body, requestId.current, locale);
      posted.current = [result.comment, ...posted.current.filter(c => c.id !== result.comment.id)];
      setPage(p => ({ ...p, comments: [result.comment, ...p.comments.filter(c => c.id !== result.comment.id)] }));
      showNewest();
      setBody(""); setLatestId(result.comment.id); requestId.current = randomId(); onAdded();
    } catch (error) {
      setSendError(error instanceof ApiError && error.code === "MODERATION_REJECTED" ? t.moderationRejected : error instanceof ApiError && error.code === "MODERATION_UNAVAILABLE" ? t.moderationUnavailable : error instanceof ApiError && error.status === 429 ? t.rateLimited : t.saveFailed);
    } finally { pending.current = false; setSending(false); }
  }

  return <section className="diary-responses" hidden={!active} aria-label={t.responses}>
    <div className="replies-scroll" ref={list} tabIndex={-1} aria-label={t.responses}>
      <ol className="replies-list">
        {page.comments.map(comment => <li className="reply-item" data-new={comment.id === latestId} key={comment.id}>
          <span className="reply-nickname">{comment.nickname}</span>
          <p>{comment.body}</p>
        </li>)}
      </ol>
      {!page.comments.length && !busy && !loadFailed && <p className="replies-empty">{t.noResponses}</p>}
      {busy && <p className="reply-status" role="status">{t.replyLoading}</p>}
      {loadFailed && <div className="reply-load-error" role="alert"><p className="reply-status">{t.replyLoadFailed}</p><button type="button" className="text-button" onClick={() => page.nextCursor ? more() : setReload(n => n + 1)}>{t.retry}</button></div>}
      {page.nextCursor && !loadFailed && <button type="button" className="text-button replies-more" disabled={busy} onClick={more}>{t.loadMore}</button>}
    </div>
    {!local && <form className="reply-form" onSubmit={submit}>
      <div className="reply-composer">
        <textarea ref={input} rows={1} aria-label={t.reply} aria-describedby={sendError ? feedbackId : undefined}
          placeholder={t.replyPlaceholder} value={body} maxLength={BODY_LIMIT * 2} readOnly={sending}
          onFocus={() => setEditing(true)} onBlur={() => setEditing(false)}
          onChange={e => { setBody(clipText(e.target.value)); setSendError(""); requestId.current = randomId(); }}/>
        <button className="reply-send" aria-label={sending ? t.publishing : t.sendReply} title={t.sendReply}
          onPointerDown={e => { if (document.activeElement === input.current) e.preventDefault(); }}
          disabled={sending || !bodySchema.safeParse(body).success} type="submit">
          {sending ? <LoaderCircle size={18} className="reply-spinner" aria-hidden="true"/> : <ArrowUp size={19} aria-hidden="true"/>}
        </button>
      </div>
      <div className="reply-feedback">
        <span id={feedbackId} className="reply-feedback-message" role={sendError ? "alert" : "status"}>{sendError || (sending ? t.publishing : latestId ? t.replySent : "")}</span>
        <small className="reply-count" data-visible={editing || !!body}>{textLength(body)} / {BODY_LIMIT}</small>
      </div>
    </form>}
  </section>;
}
