import data from "./places.json";
import type { Place } from "./types";
import { placeSchema } from "./place-schema";
export const places = data as Place[];
const CUSTOM_KEY = "one-day-places-v1";
export function registerPlace(place: Place, persist = true) {
  place = placeSchema.parse(place);
  if (!places.some(p => p.id === place.id)) places.push(place);
  if (persist && typeof window !== "undefined") {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(places.filter(p => p.origin === "photon")));
  }
  return places.find(p => p.id === place.id)!;
}
export function restorePlaces() {
  const raw = localStorage.getItem(CUSTOM_KEY);
  if (!raw) return;
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) return;
  for (const p of data) {
    if (p?.origin !== "photon" || !placeSchema.safeParse(p).success || !/^osm-[NRW]-\d+$/.test(p.id)) continue;
    if (!["name", "englishName", "region", "country", "countryCode", "aliases", "sourceShapeId"].every(key => typeof p[key] === "string")) continue;
    if (!Array.isArray(p.center) || p.center.length !== 2 || !p.center.every(Number.isFinite) || Math.abs(p.center[0]) > 180 || Math.abs(p.center[1]) > 85) continue;
    if (!Array.isArray(p.bounds) || p.bounds.length !== 4 || !p.bounds.every(Number.isFinite)) continue;
    if (!places.some(existing => existing.id === p.id)) places.push(p);
  }
}
export function findPlaces(query: string): Place[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return places;
  const terms = q.split(/\s+/);
  return places.filter((p) =>
    terms.every((term) =>
      `${p.name} ${p.englishName} ${p.region} ${p.country} ${p.aliases}`
        .toLocaleLowerCase()
        .includes(term),
    ),
  );
}
