import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { RateLimitError, type RateGroup } from "./rate-limit.ts";

const MAX_AGE = 30 * 86400;
const state = globalThis as typeof globalThis & { oneDayCookieSecret?: string; oneDayBrowserLimiter?: ReturnType<typeof createBrowserLimiter> };
function secret() {
  const configured = process.env.ANONYMOUS_COOKIE_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("ANONYMOUS_NOT_CONFIGURED");
  return state.oneDayCookieSecret ??= randomBytes(32).toString("hex");
}
const sign = (value: string, key: string) => createHmac("sha256", key).update(value).digest("base64url");
export function verifyBrowserToken(token: string, key: string, now = Date.now()) {
  if (token.length > 160) return null;
  const match = /^([a-f0-9]{32})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const expires = Number(match[2]);
  if (expires <= now / 1000 || expires > now / 1000 + MAX_AGE + 60) return null;
  const expected = sign(`${match[1]}.${match[2]}`, key);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(match[3])) ? match[1] : null;
}
export function browserIdentity(request: Request, key = secret(), now = Date.now()) {
  const secure = process.env.VERCEL === "1" || new URL(request.url).protocol === "https:";
  const name = secure ? "__Host-one_day_browser" : "one_day_browser";
  const cookies = request.headers.get("cookie") ?? "";
  if (cookies.length > 16384) throw new Error("INVALID_BODY");
  const token = cookies.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  const existing = verifyBrowserToken(token, key, now);
  if (existing) return { id: existing, cookie: null };
  const id = randomBytes(16).toString("hex"), value = `${id}.${Math.floor(now / 1000) + MAX_AGE}`;
  return { id, cookie: `${name}=${value}.${sign(value, key)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` };
}

export const browserRules = {
  search: { capacity: 5, perSecond: 1 / 3, concurrent: 2 },
  diary: { capacity: 2, perSecond: 1 / 60, concurrent: 1 },
  comment: { capacity: 3, perSecond: 1 / 20, concurrent: 1 },
  query: { capacity: 30, perSecond: 2, concurrent: 6 },
} satisfies Record<RateGroup, { capacity: number; perSecond: number; concurrent: number }>;
export function createBrowserLimiter(now = () => performance.now(), maxEntries = 10000) {
  type Bucket = { tokens: number; at: number; active: number };
  const visitors = new Map<string, { seen: number; buckets: Partial<Record<RateGroup, Bucket>> }>();
  let swept = 0;
  return (id: string, group: RateGroup) => {
    const at = now();
    if (at - swept >= 60000 || visitors.size >= maxEntries) {
      for (const [key, value] of visitors) if (at - value.seen > 3600000 && Object.values(value.buckets).every(b => !b.active)) visitors.delete(key);
      swept = at;
    }
    let visitor = visitors.get(id);
    if (!visitor) {
      // Refuse new identities at capacity; never evict a live quota to reset it.
      if (visitors.size >= maxEntries) throw new RateLimitError(60);
      visitor = { seen: at, buckets: {} }; visitors.set(id, visitor);
    }
    visitor.seen = at;
    const rule = browserRules[group], bucket = visitor.buckets[group] ??= { tokens: rule.capacity, at, active: 0 };
    bucket.tokens = Math.min(rule.capacity, bucket.tokens + Math.max(0, at - bucket.at) / 1000 * rule.perSecond); bucket.at = at;
    if (bucket.tokens < 1 || bucket.active >= rule.concurrent) throw new RateLimitError(Math.max(1, (1 - bucket.tokens) / rule.perSecond));
    bucket.tokens--; bucket.active++;
    let released = false;
    return () => { if (!released) { released = true; bucket.active--; } };
  };
}
export function acquireBrowser(id: string, group: RateGroup) { return (state.oneDayBrowserLimiter ??= createBrowserLimiter())(id, group); }
