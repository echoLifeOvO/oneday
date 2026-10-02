type Point = [number, number];
export type PinchDelta = { zoom: number; panX: number; panY: number; anchor: Point };

// Every sample becomes the next baseline, including when zoom is clamped.
// Reversing at a limit responds immediately; lifting fingers adds no inertia.
export class PinchGesture {
  readonly points = new Map<number, Point>();
  private sample() {
    const [a, b] = this.points.values();
    return a && b ? { distance: Math.hypot(b[0] - a[0], b[1] - a[1]),
      center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point } : null;
  }
  down(id: number, point: Point) { this.points.set(id, point); }
  move(id: number, point: Point): PinchDelta | null {
    if (!this.points.has(id)) return null;
    const previous = this.sample();
    this.points.set(id, point);
    const next = this.sample();
    if (!previous || !next || previous.distance < 4 || next.distance < 4) return null;
    return { zoom: Math.log2(next.distance / previous.distance),
      panX: previous.center[0] - next.center[0], panY: previous.center[1] - next.center[1], anchor: next.center };
  }
  up(id: number) { this.points.delete(id); }
  clear() { this.points.clear(); }
}
