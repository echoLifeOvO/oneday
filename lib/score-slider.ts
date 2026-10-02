export function scoreAtPosition(clientX: number, left: number, width: number): number {
  return Math.round(Math.max(0, Math.min(100, (clientX - left) / Math.max(1, width) * 100)));
}

export function scoreForKey(score: number, key: string): number | null {
  const next = key === "Home" ? 0 : key === "End" ? 100
    : key === "ArrowRight" || key === "ArrowUp" ? score + 1
    : key === "ArrowLeft" || key === "ArrowDown" ? score - 1
    : key === "PageUp" ? score + 10 : key === "PageDown" ? score - 10 : null;
  return next === null ? null : Math.max(0, Math.min(100, next));
}
