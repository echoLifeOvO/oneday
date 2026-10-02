import type { Place } from "./types";
import { placeSchema } from "./place-schema.ts";

export function photonPlaces(data: unknown): Place[] {
  if (!data || typeof data !== "object" || !("features" in data) || !Array.isArray(data.features)) return [];
  const result: Place[] = [];
  for (const feature of data.features) {
    const p = feature?.properties, xy = feature?.geometry?.coordinates;
    if (!p || !Array.isArray(xy) || xy.length !== 2 || !xy.every(Number.isFinite) || Math.abs(xy[0]) > 180 || Math.abs(xy[1]) > 85) continue;
    if (!p.name || !p.countrycode || !["N", "R", "W"].includes(p.osm_type) || !Number.isSafeInteger(p.osm_id)) continue;
    if (!["city", "district", "county", "locality"].includes(p.type)) continue;
    if (!["place", "boundary"].includes(p.osm_key)) continue;
    const countryCode = String(p.countrycode).toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode) || (countryCode === "CN" && p.type === "locality")) continue;
    const extent = p.extent;
    const bounds: Place["bounds"] = Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite)
      ? [extent[0], extent[3], extent[2], extent[1]] : [xy[0] - .045, xy[1] - .035, xy[0] + .045, xy[1] + .035];
    result.push({ id: `osm-${p.osm_type}-${p.osm_id}`, name: String(p.name), englishName: String(p.name),
      region: [...new Set([p.state, p.county, p.city].filter(v => typeof v === "string" && v !== p.name))].join(" · "),
      country: new Intl.DisplayNames(["zh"], { type: "region" }).of(countryCode) ?? String(p.country ?? countryCode), countryCode,
      center: [xy[0], xy[1]], bounds, aliases: "", sourceShapeId: "", origin: "photon" });
  }
  return [...new Map(result.filter(p => placeSchema.safeParse(p).success).map(p => [p.id, p])).values()].slice(0, 8);
}
