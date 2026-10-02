import { ZodError } from "zod";
import { REQUEST_BYTES } from "../limits.ts";
import { acquire, RateLimitError, type RateGroup } from "./rate-limit.ts";
import { acquireBrowser, browserIdentity } from "./anonymous.ts";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function apiError(error: unknown) {
  if (error instanceof RateLimitError) return Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" } });
  const code = error instanceof Error ? error.message : "";
  if (error && typeof error === "object" && "code" in error && ["23514", "23502", "22001", "22P02"].includes(String(error.code))) return json({ error: "INVALID_INPUT" }, 400);
  if (error instanceof ZodError || ["INVALID_CURSOR", "INVALID_LIMIT", "INVALID_PLACE", "INVALID_BODY"].includes(code)) return json({ error: "INVALID_INPUT" }, 400);
  if (code === "BODY_TOO_LARGE") return json({ error: code }, 413);
  if (code === "CROSS_ORIGIN") return json({ error: code }, 403);
  if (code === "REQUEST_CONFLICT") return json({ error: code }, 409);
  if (code === "NOT_FOUND") return json({ error: code }, 404);
  if (code === "MODERATION_REJECTED") return json({ error: code }, 422);
  if (code === "MODERATION_UNAVAILABLE" || code === "ANONYMOUS_NOT_CONFIGURED") return json({ error: code }, 503);
  if (code === "DATABASE_NOT_CONFIGURED") return json({ error: code }, 503);
  // Never echo SQL, connection strings, or private database errors to the caller.
  const safeReasons: Record<string, string> = {
    "timeout exceeded when trying to connect": "pool-acquire-timeout",
    "Connection terminated due to connection timeout": "database-connect-timeout",
    "Connection terminated unexpectedly": "database-disconnected",
    "Query read timeout": "database-query-timeout",
  };
  const dbCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  console.error("[diary-api] request failed", {
    reason: safeReasons[code] || "unclassified",
    code: /^(?:[0-9A-Z]{5}|ETIMEDOUT|ECONNRESET|ECONNREFUSED)$/.test(dbCode) ? dbCode : undefined,
  });
  return json({ error: "SERVICE_UNAVAILABLE" }, 503);
}
export async function limited(group: RateGroup, action: () => Promise<Response>, request?: Request) {
  let release: (() => void) | undefined, releaseBrowser: (() => void) | undefined, cookie: string | null = null;
  let response: Response;
  try {
    release = acquire(group);
    if (request) { const visitor = browserIdentity(request); cookie = visitor.cookie; releaseBrowser = acquireBrowser(visitor.id, group); }
    response = await action();
  } catch (error) { response = apiError(error); }
  finally { releaseBrowser?.(); release?.(); }
  if (cookie) response.headers.append("Set-Cookie", cookie);
  return response;
}
export async function readBody(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  // Next's internal request URL may use localhost behind the public Host.
  const url = new URL(request.url);
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.slice(0, -1);
  const publicOrigin = `${protocol}://${request.headers.get("host") || url.host}`;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== publicOrigin)) throw new Error("CROSS_ORIGIN");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("INVALID_BODY");
  if (Number(request.headers.get("content-length")) > REQUEST_BYTES) throw new Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > REQUEST_BYTES) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("INVALID_BODY"); }
}
