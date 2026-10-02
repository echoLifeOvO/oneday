import type { DayInput } from "./local-days";
import type { Diary, DiaryPage, Discovery, Place, RecentPlace, StreamPage, Comment, CommentPage } from "./types";
import type { Locale } from "./i18n";
import { STREAM_SIZE } from "./limits";
export class ApiError extends Error {
  status: number; retryAfter: number; code: string;
  constructor(status: number, retryAfter = 1, code = "DIARY_API_FAILED") { super(code); this.status = status; this.retryAfter = retryAfter; this.code = code; }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(init?.method === "POST" ? 30000 : 20000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetch(url, { cache: "no-store", ...init, signal });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, Math.max(1, Number(response.headers.get("Retry-After")) || 1), typeof data?.error === "string" ? data.error : undefined);
  }
  return response.json();
}
export async function getDiscovery(signal?: AbortSignal) {
  let cursor: string | null = null;
  const all: Discovery["places"] = [];
  let mode: Discovery["mode"] = "preview";
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const page = await request<Discovery>(`/api/discovery?${params}`, { signal });
    all.push(...page.places); mode = page.mode;
    if (page.nextCursor && page.nextCursor === cursor) throw new Error("INVALID_CURSOR");
    cursor = page.nextCursor;
  } while (cursor);
  return { mode, places: all, nextCursor: null };
}
export function getStream(signal?: AbortSignal) { return request<StreamPage>(`/api/stream?limit=${STREAM_SIZE}`, { signal }); }
export function getDiary(id: string, signal?: AbortSignal) { return request<{ diary: Diary }>(`/api/diaries/${encodeURIComponent(id)}`, { signal }); }
export function getComments(id: string, cursor: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: "20" }); if (cursor) params.set("cursor", cursor);
  return request<CommentPage>(`/api/diaries/${encodeURIComponent(id)}/comments?${params}`, { signal });
}
export function publishComment(id: string, body: string, requestId: string, locale: Locale) {
  return request<{ comment: Comment }>(`/api/diaries/${encodeURIComponent(id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, requestId, locale }) });
}
export function getRecentPlaces(signal?: AbortSignal) { return request<{ places: RecentPlace[] }>("/api/places/recent?limit=5", { signal }); }
export function getDiaries(placeId: string, cursor: string | null = null, signal?: AbortSignal) {
  const params = new URLSearchParams({ placeId, limit: "30" });
  if (cursor) params.set("cursor", cursor);
  return request<DiaryPage>(`/api/diaries?${params}`, { signal });
}
export async function publishDiary(input: DayInput, place: Place, locale: Locale, requestId: string) {
  const { body, cost, currency, score } = input;
  return request<{ diary: Diary } | { preview: true }>("/api/diaries", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, cost, currency, score, place, locale, requestId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
}
