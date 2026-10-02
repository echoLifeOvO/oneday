export type ViewOrigin = { center: [number, number] };
// Vercel resolves the request IP. Keep only a coarse orientation; do not retain IPs.
export function viewOrigin(headers: Headers): ViewOrigin | null {
  const lat = headers.get("x-vercel-ip-latitude"), lng = headers.get("x-vercel-ip-longitude");
  if (!lat?.trim() || !lng?.trim()) return null;
  const latitude=Number(lat), longitude=Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return null;
  return {center:[Math.round(longitude),Math.max(-55,Math.min(55,Math.round(latitude)))]};
}
