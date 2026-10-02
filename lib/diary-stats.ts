import type { Diary, PlaceStats } from "./types";

export function mergeStats(items: PlaceStats[]): PlaceStats {
  const rows = items.filter(s => s.count > 0);
  const currencies = new Map<string, { currency: string; min: number; max: number }>();
  for (const row of rows) for (const cost of row.costs) {
    const existing = currencies.get(cost.currency);
    currencies.set(cost.currency, { currency: cost.currency, min: Math.min(existing?.min ?? Infinity, cost.min), max: Math.max(existing?.max ?? -Infinity, cost.max) });
  }
  return { count: rows.reduce((n, s) => n + s.count, 0), minScore: rows.length ? Math.min(...rows.map(s => s.minScore!)) : null,
    maxScore: rows.length ? Math.max(...rows.map(s => s.maxScore!)) : null, costs: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}

export function diaryStats(diaries: Diary[], placeIds: string[]) {
  const ids = new Set(placeIds);
  const rows = diaries.filter(d => ids.has(d.placeId));
  const byCurrency = new Map<string, number[]>();
  for (const day of rows) byCurrency.set(day.currency, [...(byCurrency.get(day.currency) ?? []), day.cost]);
  return {
    count: rows.length,
    minScore: rows.length ? Math.min(...rows.map(d => d.score)) : null,
    maxScore: rows.length ? Math.max(...rows.map(d => d.score)) : null,
    // Different currencies are never compared as though they were the same unit.
    costs: [...byCurrency].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amounts]) => ({
      currency, min: Math.min(...amounts), max: Math.max(...amounts),
    })),
  };
}
export function isCostInput(value: string) {
  return /^\d{0,9}(?:\.\d{0,2})?$/.test(value);
}
