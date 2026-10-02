import data from "../places.json" with { type: "json" };
import { demoDiaries } from "../demo.ts";
import { diaryStats } from "../diary-stats.ts";
import type { Place, PlaceSummary, RecentPlace } from "../types.ts";

// These dates are fixture ordering only; never write these examples into PG.
export const previewDiaries = demoDiaries.map(d => ({ ...d, createdAt: `${d.date}T12:00:00.000Z` }));
export function previewSummaries(): PlaceSummary[] {
  return (data as Place[]).map(place => ({ place, stats: diaryStats(previewDiaries, [place.id]) })).filter(p => p.stats.count);
}
export function previewRecent(limit: number, cursor: { at: string; id: string } | null = null): RecentPlace[] {
  return previewSummaries().map(({ place, stats }) => ({ place, count: stats.count,
    latestPublishedAt: previewDiaries.filter(d => d.placeId === place.id).map(d => d.createdAt).sort().at(-1)! }))
    .filter(p => !cursor || p.latestPublishedAt < cursor.at || (p.latestPublishedAt === cursor.at && p.place.id > cursor.id))
    .sort((a, b) => b.latestPublishedAt.localeCompare(a.latestPublishedAt) || a.place.id.localeCompare(b.place.id)).slice(0, limit);
}
