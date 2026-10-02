export const MIN_ZOOM = -0.5;
export const MAX_ZOOM = 14;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Keep poles away from the centre in the globe view. At street scales the
// wider limit still lets people visit northern towns without tilting the map.
export function latitudeLimit(zoom: number) {
  return 55 + 30 * clamp((zoom - 4) / 2, 0, 1);
}

export function constrainLatitude(latitude: number, zoom: number) {
  const limit = latitudeLimit(zoom);
  return clamp(latitude, -limit, limit);
}

export function viewportZoom(width: number, height: number) {
  return 2 + Math.log2(Math.max(120, Math.min(width - 32, height - 160)) / 800);
}

// A globe's apparent size includes latitude. Use the initial view as the
// minimum visible size, even after rotating it north or south.
export function overviewZoom(width: number, height: number, latitude: number) {
  return viewportZoom(width, height) + Math.log2(Math.cos(latitude * Math.PI / 180) / Math.cos(24 * Math.PI / 180));
}

export function constrainZoom(zoom: number, latitude: number, minimumAtEquator = MIN_ZOOM) {
  const minimum = minimumAtEquator + Math.log2(Math.cos(latitude * Math.PI / 180));
  return clamp(zoom, minimum, MAX_ZOOM);
}

export function panCamera(
  center: { lng: number; lat: number }, zoom: number, x: number, y: number,
) {
  const radians = Math.PI / 180;
  const worldSize = 512 * 2 ** zoom;
  const mercatorY = Math.asinh(Math.tan(center.lat * radians));
  const latitude = constrainLatitude(
    Math.atan(Math.sinh(mercatorY - y * 2 * Math.PI / worldSize)) / radians,
    zoom,
  );
  const longitude = center.lng + x * 360 / worldSize;
  // MapLibre's globe radius is worldSize / (2π cos(latitude)). Compensating
  // here keeps vertical rotation from silently making the planet grow/shrink.
  const globeWeight = 1 - clamp((zoom - 4) / 2, 0, 1);
  const adjustment = Math.log2(Math.cos(latitude * radians) / Math.cos(center.lat * radians));
  return {
    center: [((longitude + 180) % 360 + 360) % 360 - 180, latitude] as [number, number],
    zoom: constrainZoom(zoom + adjustment * globeWeight, latitude),
  };
}

export function nextClickZoom(current: number, pending: number | null) {
  return clamp(Math.max(current, pending ?? current) + 0.85, MIN_ZOOM, MAX_ZOOM);
}

export function wheelIntent(
  event: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean },
  pageHeight: number,
) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
  const x = event.deltaX * unit;
  const y = event.deltaY * unit;
  // Browsers encode trackpad pinch as Ctrl + wheel, separate from two-finger
  // scrolling. Keep its scale continuous; never guess the device by speed.
  return event.ctrlKey
    ? { kind: "zoom" as const, zoom: -y / (100 * Math.LN2) }
    : { kind: "pan" as const, x, y };
}

export function scaleZoomDelta(previous: number, current: number) {
  return previous > 0 && current > 0 ? Math.log2(current / previous) : 0;
}
