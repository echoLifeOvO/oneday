import type { StreamDiary } from "./types.ts";

// A publication owns one element in the stream, even if an API page overlaps.
export function uniqueStream(diaries: StreamDiary[]): StreamDiary[] {
  return [...new Map(diaries.filter(day => day.place).map(day => [day.id, day])).values()];
}

export function streamFlight(viewportWidth: number, contentWidth: number, currentX?: number) {
  const start = Math.min(currentX ?? viewportWidth + 20, viewportWidth + 20);
  const end = -contentWidth - 20;
  return { start, end, duration: Math.max(1, (start - end) / 38 * 1000) };
}
