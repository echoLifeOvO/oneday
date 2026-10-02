export type RateGroup = "search" | "diary" | "comment" | "query";
export const rateRules = {
  search: { capacity: 8, perSecond: 1, concurrent: 3 },
  diary: { capacity: 10, perSecond: 1, concurrent: 3 },
  comment: { capacity: 20, perSecond: 2, concurrent: 4 },
  query: { capacity: 120, perSecond: 30, concurrent: 12 },
} satisfies Record<RateGroup, { capacity: number; perSecond: number; concurrent: number }>;
export class RateLimitError extends Error {
  retryAfter: number;
  constructor(seconds: number) { super("RATE_LIMITED"); this.retryAfter = Math.max(1, Math.ceil(seconds)); }
}
export function createLimiter(now: () => number = () => performance.now()) {
  const buckets = new Map<RateGroup, { tokens: number; at: number; active: number }>();
  return (group: RateGroup) => {
    const rule = rateRules[group], at = now();
    const bucket = buckets.get(group) ?? { tokens: rule.capacity, at, active: 0 };
    bucket.tokens = Math.min(rule.capacity, bucket.tokens + Math.max(0, at - bucket.at) / 1000 * rule.perSecond);
    bucket.at = at; buckets.set(group, bucket);
    if (bucket.tokens < 1 || bucket.active >= rule.concurrent) throw new RateLimitError(Math.max(1, (1 - bucket.tokens) / rule.perSecond));
    bucket.tokens--; bucket.active++;
    let released = false;
    return () => { if (!released) { released = true; bucket.active--; } };
  };
}
// Four fixed buckets; no user/IP keys or unbounded request queues.
const state = globalThis as typeof globalThis & { oneDayLimiter?: ReturnType<typeof createLimiter> };
export function acquire(group: RateGroup) { return (state.oneDayLimiter ??= createLimiter())(group); }
