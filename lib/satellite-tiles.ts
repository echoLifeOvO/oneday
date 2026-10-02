// Bounded, session-local cache shared by visible raster layers and prewarming.
// Only the current viewport, its neighbours and a selected destination are read.
export const SATELLITE_ROOT = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g";
export const RASTER_LEVELS = [
  { id: "earth-wide", max: 3, from: 0 },
  { id: "earth-country", max: 6, from: 3 },
  { id: "earth-area", max: 8, from: 6 },
  { id: "earth-region", max: 10, from: 8 },
  { id: "earth-local", max: 12, from: 10 },
  { id: "earth-detail", max: 14, from: 12 },
];
// Keep the target resolution plus one coarse fallback, not every level visited.
export function activeRasterLevels(zoom: number) {
  const target = Math.max(0, RASTER_LEVELS.findLastIndex(level => zoom >= level.from));
  return RASTER_LEVELS.slice(Math.max(0, target - 1), target + 1);
}

export type TileAddress = { z: number; x: number; y: number };
const tileKey = ({ z, x, y }: TileAddress) => `${z}/${y}/${x}`;
export function satelliteTileUrl(tile: TileAddress): string {
  return `${tile.z <= 3 ? "/imagery/2024" : SATELLITE_ROOT}/${tileKey(tile)}.jpg`;
}
const buffers = new Map<string, ArrayBuffer>();
const pending = new Map<string, Promise<ArrayBuffer>>();
let bytes = 0;
const MAX_BYTES = 24 * 1024 * 1024;
const MAX_TILES = 256;

export async function loadSatelliteTile(tile: TileAddress): Promise<ArrayBuffer> {
  const key = tileKey(tile);
  const existing = buffers.get(key);
  if (existing) {
    buffers.delete(key);
    buffers.set(key, existing);
    return existing;
  }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = (async () => {
    const response = await fetch(satelliteTileUrl(tile), {
      cache: "force-cache", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Satellite tile: ${response.status}`);
    const data = await response.arrayBuffer();
    buffers.set(key, data);
    bytes += data.byteLength;
    while (bytes > MAX_BYTES || buffers.size > MAX_TILES) {
      const first = buffers.keys().next().value!;
      bytes -= buffers.get(first)!.byteLength;
      buffers.delete(first);
    }
    return data;
  })();
  pending.set(key, request);
  try { return await request; }
  finally { pending.delete(key); }
}

export function neighbouringTiles(
  center: [number, number], bounds: [number, number, number, number], z: number, limit = 20,
): TileAddress[] {
  const n = 2 ** z;
  const x = (lng: number) => (lng + 180) / 360 * n;
  const y = (lat: number) => {
    const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180;
    return (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n;
  };
  const cx = Math.floor(x(center[0]));
  const cy = Math.floor(y(center[1]));
  const spanX = Math.min(4, Math.max(1, Math.ceil(Math.abs(x(bounds[2]) - x(bounds[0])) / 2) + 1));
  const spanY = Math.min(4, Math.max(1, Math.ceil(Math.abs(y(bounds[3]) - y(bounds[1])) / 2) + 1));
  const unique = new Map<string, TileAddress>();
  for (let dx = -spanX; dx <= spanX; dx++) for (let dy = -spanY; dy <= spanY; dy++) {
    if (cy + dy < 0 || cy + dy >= n) continue;
    const tile = { z, x: ((cx + dx) % n + n) % n, y: cy + dy };
    unique.set(tileKey(tile), tile);
  }
  // Prioritize nearby tiles, including a one-tile ring beyond the visible area.
  return [...unique.values()].sort((a, b) => {
    const distance = (t: TileAddress) => Math.min(Math.abs(t.x - cx), n - Math.abs(t.x - cx)) ** 2 + (t.y - cy) ** 2;
    return distance(a) - distance(b);
  }).slice(0, limit);
}

// One shared speculative queue: replacing a moving view must not spawn another
// pair of workers while the previous pair is still downloading.
let warmQueue: { tile: TileAddress; signal: AbortSignal }[] = [];
let warmActive = 0;
function drainWarmQueue() {
  while (warmActive < 2 && warmQueue.length) {
    const job = warmQueue.shift()!;
    if (job.signal.aborted || buffers.has(tileKey(job.tile)) || pending.has(tileKey(job.tile))) continue;
    warmActive++;
    void loadSatelliteTile(job.tile).catch(() => {}).finally(() => {
      warmActive--;
      drainWarmQueue();
    });
  }
}

export function zoomAheadTiles(
  center: [number, number], bounds: [number, number, number, number], zoom: number, direction: number,
): TileAddress[] {
  const current = Math.round(zoom + 1);
  const ahead = Math.min(14, Math.max(0, direction > 0 ? current + 1 : current - 1));
  // Only the next resolution, around the current zoom anchor; never the world
  // at full detail. Bounds shrink with the predicted zoom-in.
  const scale = direction > 0 ? 0.5 : 1;
  const halfWidth = Math.min(180, Math.abs(bounds[2] - bounds[0]) / 2) * scale;
  const halfHeight = Math.abs(bounds[3] - bounds[1]) / 2 * scale;
  return neighbouringTiles(center, [center[0] - halfWidth, center[1] - halfHeight,
    center[0] + halfWidth, center[1] + halfHeight], ahead, 12);
}

export function prewarmTiles(tiles: TileAddress[], signal: AbortSignal, budget = 32) {
  // Already-visible tiles must not consume the neighbour budget.
  const unique = new Map(tiles.map(t => [tileKey(t), t]));
  warmQueue = [...unique.values()].filter(t => !buffers.has(tileKey(t)) && !pending.has(tileKey(t)))
    .slice(0, Math.max(0, Math.min(32, budget))).map(tile => ({ tile, signal }));
  drainWarmQueue();
}
