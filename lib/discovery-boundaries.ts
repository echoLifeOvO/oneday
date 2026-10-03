import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import type { Place } from "./types.ts";

type Area = Polygon | MultiPolygon;
export type Boundary = {
  id: string;
  name: string;
  bounds: [number, number, number, number];
  geometry: Area;
  wideGeometry?: Area;
  details?: string | null;
};
export type PlaceBoundary = { place: Place; parent: Boundary; local: Boundary; precise: boolean };
export type GlowData = { regions: FeatureCollection; wide: FeatureCollection; near: FeatureCollection; local: FeatureCollection };

function inRing(point: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function contains(geometry: Area, point: Position) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)));
}
function overlap(a: number[], b: number[]) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection;
  return area > 0 ? intersection / area : 0;
}
export function selectBoundary(place: Place, boundaries: Boundary[]) {
  // A city such as Beijing can itself be an ADM1 region. Compare extents before
  // using its centre: the city centre alone would incorrectly pick Dongcheng.
  const byExtent = boundaries.map(boundary => ({ boundary, fit: overlap(place.bounds, boundary.bounds) })).sort((a,b) => b.fit-a.fit);
  if (byExtent[0]?.fit >= .55) return byExtent[0].boundary;
  return boundaries.find(b => contains(b.geometry, place.center));
}

const cache = new Map<string, Promise<Boundary[]>>();
let active = 0;
const waiting: (() => void)[] = [];
async function load(file: string): Promise<Boundary[]> {
  const existing = cache.get(file);
  if (existing) return existing;
  const task = (async () => {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    active++;
    try {
      const response = await fetch(`/data/discovery-v1/${file}`, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("discovery-boundary-unavailable");
      return await response.json() as Boundary[];
    } finally { active--; waiting.shift()?.(); }
  })();
  cache.set(file, task);
  task.catch(() => cache.delete(file));
  // Bound in-memory catalogs; browser HTTP caching handles later visits.
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return task;
}
export async function loadPlaceBoundary(place: Place): Promise<PlaceBoundary | null> {
  const cc = ({ CHN: "CN", JPN: "JP", FRA: "FR", USA: "US" } as Record<string,string>)[place.countryCode] ?? place.countryCode;
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const parents = await load(`${cc}.json`);
  const parent = selectBoundary(place, parents);
  if (!parent) return null;
  if (overlap(place.bounds, parent.bounds) >= .55) return { place, parent, local: parent, precise: true };
  if (parent.details) {
    try {
      const children = await load(parent.details);
      const local = selectBoundary(place, children);
      if (local && overlap(place.bounds, local.bounds) >= .15) return { place, parent, local, precise: true };
    } catch { /* Keep the real regional glow when detail is unavailable. */ }
  }
  // A regional discovery shape is honest about missing fine geometry; never
  // invent a county boundary from a rectangle or replace it with a DOM badge.
  return { place, parent, local: parent, precise: false };
}

export function mergeBoundaryData(base: GlowData, additions: PlaceBoundary[], counts: Record<string, number>, selected: string | null): GlowData {
  const result = Object.fromEntries(Object.entries(base).map(([key,data]) => [key, {
    type: "FeatureCollection", features: data.features.map((f: Feature) => ({ ...f, properties: { ...f.properties, ...(f.properties?.placeIds ? { placeIds: [...f.properties.placeIds] } : {}) } })),
  }])) as GlowData;
  for (const { place, parent, local, precise } of additions) {
    if (!counts[place.id] && selected !== place.id) continue;
    result.regions.features.push({ type: "Feature", id: place.id, properties: { id: place.id, precise }, geometry: local.geometry });
    for (const level of ["wide", "near", "local"] as const) {
      const features = result[level].features;
      // Share existing overview groups (e.g. two towns in Jiangsu) instead of
      // drawing the same region twice and making the overlap brighter.
      const shared = level !== "local" && features.find(f => f.properties?.alpha === .62 && contains(f.geometry as Area, place.center));
      const boundary = level === "local" ? local : parent;
      const group = shared ? shared.properties!.group : `search-${level}-${boundary.id}`;
      const groupFeatures = features.filter(f => f.properties?.group === group);
      if (groupFeatures.length) {
        for (const f of groupFeatures) if (!f.properties!.placeIds.includes(place.id)) f.properties!.placeIds.push(place.id);
      } else {
        const bands = [{ alpha: .62, geometry: level === "wide" ? boundary.wideGeometry ?? boundary.geometry : boundary.geometry }];
        bands.forEach((band, i) => features.push({ type: "Feature", id: `${group}-${i}`, properties: {
          id: `${group}-${i}`, group, placeIds: [place.id], alpha: band.alpha, softOutline: true,
        }, geometry: band.geometry }));
      }
    }
  }
  for (const level of ["wide", "near", "local"] as const) {
    for (const f of result[level].features) f.properties!.lit = f.properties!.placeIds.some((id: string) => !!counts[id]);
    result[level].features = result[level].features.filter(f => f.properties!.lit);
  }
  return result;
}
