"use client";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as LibreMap, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { places } from "@/lib/catalog";
import { mergeStats } from "@/lib/diary-stats";
import { diaryCount, formatMoney, messages, placeName, type Locale } from "@/lib/i18n";
import type { ViewOrigin } from "@/lib/view-origin";
import type { PlaceStats, Place } from "@/lib/types";
import { PinchGesture } from "@/lib/pinch-gesture";
import { RASTER_LEVELS, activeRasterLevels, loadSatelliteTile, neighbouringTiles, prewarmTiles, zoomAheadTiles } from "@/lib/satellite-tiles";
import {
  constrainLatitude,
  constrainZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  nextClickZoom,
  panCamera,
  scaleZoomDelta,
  overviewZoom,
  viewportZoom,
  wheelIntent,
} from "@/lib/earth-gestures";

export type EarthHandle = {
  focus: (place: Place, instant?: boolean, onArrive?: () => void) => void;
  home: () => void;
};
type Props = {
  paused: boolean;
  locale: Locale;
  origin: ViewOrigin | null;
  counts: Record<string, number>;
  onPlace: (id: string, open: boolean) => void;
  onReady: () => void;
  onFailure: () => void;
  onOverviewChange: (overview: boolean) => void;
  stats: Record<string, PlaceStats>;
};
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function homeView(center: [number,number] = [109,24]) {
  center = [center[0], constrainLatitude(center[1], 0)];
  return {
    center,
    zoom: overviewZoom(window.innerWidth, window.innerHeight, center[1]),
    bearing: 0,
    pitch: 0,
    roll: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  };
}
const Earth = forwardRef<EarthHandle, Props>(function Earth(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const selected = useRef<string | null>(null);
  const pulse = useRef(0);
  const cancelArrival = useRef<() => void>(() => {});
  const clickZoom = useRef<number | null>(null);
  const [error, setError] = useState<"mapFailed" | "boundariesFailed" | "">("");
  const interacted = useRef(false);
  const orientOrigin = useRef<() => void>(()=>{});
  const warmDestination = useRef<(place: Place) => void>(() => {});
  const refreshGlows = useRef<() => void>(() => {});
  const refreshMarkers = useRef<() => void>(() => {});
  const updateActivity = useRef<() => void>(() => {});

  useImperativeHandle(ref, () => ({
    focus(place, instant = false, onArrive) {
      interacted.current = true;
      const m = map.current;
      if (!m?.getSource("regions")) return;
      cancelArrival.current();
      warmDestination.current(place);
      clickZoom.current = null;
      m.stop();
      cancelAnimationFrame(pulse.current);
      if (selected.current)
        m.setFeatureState(
          { source: "regions", id: selected.current },
          { selected: false, pulse: 0 },
        );
      selected.current = place.id;
      refreshGlows.current();
      refreshMarkers.current();
      m.setFeatureState(
        { source: "regions", id: place.id },
        { selected: true, pulse: 0 },
      );
      const height = m.getContainer().clientHeight;
      const width = m.getContainer().clientWidth;
      const [west, south, east, north] = place.bounds;
      m.once("moveend", () => {
        if (
          map.current !== m ||
          latest.current.paused ||
          selected.current !== place.id ||
          reducedMotion()
        )
          return;
        const start = performance.now();
        const animate = (now: number) => {
          if (map.current !== m || selected.current !== place.id) return;
          const t = (now - start) / 1000;
          m.setFeatureState(
            { source: "regions", id: place.id },
            { pulse: t >= 1 ? 0 : Math.sin(t * Math.PI * 2) ** 2 },
          );
          if (t < 1) pulse.current = requestAnimationFrame(animate);
        };
        pulse.current = requestAnimationFrame(animate);
      });
      if (onArrive) {
        const arrive = () => { cancelArrival.current = () => {}; if(selected.current === place.id) onArrive(); };
        m.once("moveend", arrive);
        cancelArrival.current = () => { m.off("moveend", arrive); cancelArrival.current = () => {}; };
      }
      m.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: {
            top: Math.min(100, height * .18),
            bottom: Math.min(90, height * .16),
            left: Math.min(100, width * .1),
            right: Math.min(100, width * .1),
          },
          maxZoom: 11,
          duration: instant || reducedMotion() ? 0 : 1700,
          bearing: 0,
          pitch: 0,
          roll: 0,
        },
      );
    },
    home() {
      interacted.current = true;
      cancelArrival.current();
      const m = map.current;
      if (!m) return;
      cancelAnimationFrame(pulse.current);
      if (selected.current && m.getSource("regions"))
        m.setFeatureState(
          { source: "regions", id: selected.current },
          { selected: false, pulse: 0 },
        );
      selected.current = null;
      clickZoom.current = null;
      m.flyTo({ ...homeView(latest.current.origin?.center), duration: reducedMotion() ? 0 : 1200 });
    },
  }));

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let resizing = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const isPaused = () => latest.current.paused || resizing;
    let m: LibreMap;
    try {
      maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
      maplibregl.setWorkerCount(2);
      maplibregl.setMaxParallelImageRequests(8);
      maplibregl.addProtocol("day-satellite", async (request, controller) => {
        const [z, y, x] = request.url.replace("day-satellite://", "").split("/").map(Number);
        const data = await loadSatelliteTile({ z, x, y });
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        return { data };
      });
      m = new maplibregl.Map({
        container: element,
        ...homeView(latest.current.origin?.center),
        // Allow latitude compensation below the user-facing minimum size.
        minZoom: MIN_ZOOM - 1,
        maxZoom: MAX_ZOOM,
        minPitch: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        touchZoomRotate: false,
        rollEnabled: false,
        dragPan: false,
        scrollZoom: false,
        doubleClickZoom: false,
        attributionControl: false,
        // One resize owner: modal/search pause must also defer drawing-buffer changes.
        trackResize: false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        fadeDuration: 0,
        maxTileCacheSize: 64,
        maxTileCacheZoomLevels: 10,
        cancelPendingTileRequestsWhileZooming: false,
        refreshExpiredTiles: false,
        canvasContextAttributes: { antialias: true },
        transformCameraUpdate: (next) => ({
          bearing: 0,
          pitch: 0,
          roll: 0,
          center: new maplibregl.LngLat(
            next.center.lng,
            constrainLatitude(next.center.lat, next.zoom),
          ),
          zoom: constrainZoom(next.zoom, constrainLatitude(next.center.lat, next.zoom), overviewZoom(element.clientWidth, element.clientHeight, 0)),
        }),
        style: {
          version: 8,
          projection: { type: "globe" },
          sources: {
            // A 13 KB overview appears without waiting for the remote tile service.
            overview: {
              type: "raster",
              tiles: ["/imagery/earth-overview.jpg"],
              tileSize: 256,
              minzoom: 0,
              maxzoom: 0,
            },
            ...Object.fromEntries(RASTER_LEVELS.map(level => [level.id, {
              type: "raster" as const,
              tiles: ["day-satellite://{z}/{y}/{x}"],
              tileSize: 256, minzoom: 0, maxzoom: level.max,
            }])),
          },
          layers: [
            {
              id: "overview",
              type: "raster",
              source: "overview",
              paint: { "raster-saturation": -0.3, "raster-fade-duration": 0 },
            },
            ...RASTER_LEVELS.map((level, index) => ({
              id: level.id, type: "raster" as const, source: level.id,
              minzoom: level.from,
              maxzoom: RASTER_LEVELS[index + 2]?.from ?? 24,
              paint: {
                "raster-saturation": -0.25,
                "raster-contrast": -0.04,
                "raster-opacity": 0,
                "raster-fade-duration": 0,
                "raster-resampling": "linear" as const,
              },
            })),
          ],
          sky: {
            "sky-color": "#f7f3eb",
            "horizon-color": "#dce7e0",
            "fog-color": "#e7ebe1",
            "sky-horizon-blend": 0.7,
            "horizon-fog-blend": 0.2,
            "fog-ground-blend": 0.08,
            "atmosphere-blend": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.28,
              3,
              0.18,
              6,
              0,
            ],
          },
        },
      });
    } catch {
      setError("mapFailed");
      latest.current.onFailure();
      return;
    }
    map.current = m;
    m.jumpTo(homeView(latest.current.origin?.center));
    let oriented = !!latest.current.origin;
    element.dataset.origin=oriented?"ip":"default";
    orientOrigin.current=()=>{
      if(!latest.current.origin || oriented || interacted.current || isPaused()) return;
      oriented=true;
      m.jumpTo(homeView(latest.current.origin.center));
      element.dataset.origin="ip";
    };
    m.touchZoomRotate.disable();
    m.keyboard.disableRotation();
    const canvas = m.getCanvas();
    // Pan keeps north up and treats each screen axis independently. Trackpad
    // scrolling uses the same path as dragging; pinch remains a separate input.
    let inputFrame = 0;
    let panX = 0;
    let panY = 0;
    let zoomDelta = 0;
    let zoomPoint: [number, number] = [0, 0];
    let safariScale: number | null = null;
    const onSurface = (point: maplibregl.PointLike) => {
      const projected = m.project(m.unproject(point));
      const p = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
      // Unproject clamps sky coordinates to the horizon. Round-tripping filters
      // those out using public APIs, without reaching into the map transform.
      return Math.hypot(projected.x - p.x, projected.y - p.y) < 3;
    };
    const applyInput = () => {
      inputFrame = 0;
      if (isPaused()) { panX = panY = zoomDelta = 0; return; }
      if (panX || panY) {
        m.jumpTo(panCamera(m.getCenter(), m.getZoom(), panX, panY));
      }
      if (zoomDelta) {
        const point = onSurface(zoomPoint) ? zoomPoint : m.project(m.getCenter());
        const zoom = constrainZoom(m.getZoom() + zoomDelta, m.getCenter().lat, overviewZoom(element.clientWidth, element.clientHeight, 0));
        // Clamp BEFORE anchoring. A rejected zoom must not still move the
        // anchor, then spring back from MapLibre's accumulated requested state.
        if (Math.abs(zoom - m.getZoom()) > .00001) m.jumpTo(m.calculateAnchoredCameraOptions({
          anchorLocation: m.unproject(point),
          anchorScreenPoint: point,
          zoom,
        }));
      }
      panX = panY = zoomDelta = 0;
    };
    const scheduleInput = () => {
      clickZoom.current = null;
      if (!inputFrame) {
        m.stop();
        inputFrame = requestAnimationFrame(applyInput);
      }
    };
    const pointerPosition = (e: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
    };
    const wheel = (e: WheelEvent) => {
      interacted.current = true;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isPaused()) return;
      cancelArrival.current();
      if (safariScale !== null) return;
      const intent = wheelIntent(e, canvas.clientHeight);
      if (intent.kind === "zoom") {
        zoomDelta += intent.zoom;
        zoomPoint = pointerPosition(e);
      } else {
        panX += intent.x;
        panY += intent.y;
      }
      scheduleInput();
    };
    type SafariGesture = Event & { scale: number; clientX: number; clientY: number };
    const gestureStart = (event: Event) => {
      interacted.current = true;
      if (isPaused()) return;
      cancelArrival.current();
      event.preventDefault();
      // Touch uses our pointer path; only desktop Safari uses GestureEvent.
      if (pinch.points.size > 1 || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      safariScale = (event as SafariGesture).scale;
      clickZoom.current = null;
      m.stop();
    };
    const gestureChange = (event: Event) => {
      if (safariScale === null) return;
      event.preventDefault();
      const e = event as SafariGesture;
      zoomDelta += scaleZoomDelta(safariScale, e.scale);
      safariScale = e.scale;
      zoomPoint = pointerPosition(e);
      scheduleInput();
    };
    const gestureEnd = (event: Event) => {
      if (safariScale === null) return;
      event.preventDefault();
      safariScale = null;
    };
    const pinch = new PinchGesture();
    let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    let suppressClick = false;
    const down = (e: PointerEvent) => {
      interacted.current = true;
      if (isPaused()) return;
      cancelArrival.current();
      if (e.button !== 0) return;
      pinch.down(e.pointerId, pointerPosition(e));
      canvas.setPointerCapture(e.pointerId);
      if (pinch.points.size > 1) {
        if (inputFrame) { cancelAnimationFrame(inputFrame); applyInput(); }
        drag = null;
        suppressClick = true;
        return;
      }
      m.stop();
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    };
    const move = (e: PointerEvent) => {
      if (isPaused()) return;
      const delta = pinch.move(e.pointerId, pointerPosition(e));
      if (delta) {
        panX += delta.panX; panY += delta.panY; zoomDelta += delta.zoom;
        zoomPoint = delta.anchor;
        scheduleInput();
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 3) return;
      drag.moved = true;
      panX -= e.clientX - drag.x;
      panY -= e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      scheduleInput();
    };
    const up = (e: PointerEvent) => {
      if (!pinch.points.has(e.pointerId)) return;
      // Apply the last queued sample now. No queued movement or native
      // pinch-inertia animation is allowed to run after the fingers lift.
      if (inputFrame) { cancelAnimationFrame(inputFrame); applyInput(); }
      const wasPinching = pinch.points.size > 1;
      pinch.up(e.pointerId);
      if (drag?.id === e.pointerId) {
        suppressClick = drag.moved || e.type === "pointercancel";
        drag = null;
      }
      if (wasPinching) {
        suppressClick = true;
        const remaining = pinch.points.entries().next().value;
        if (pinch.points.size === 1 && remaining) {
          const rect = canvas.getBoundingClientRect(), [id, point] = remaining;
          const x = point[0] + rect.left, y = point[1] + rect.top;
          drag = { id, x, y, startX: x, startY: y, moved: true };
        }
      }
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const click = (e: MouseEvent) => {
      if (!suppressClick && !isPaused()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClick = false;
    };
    const keyboardIntent = () => { interacted.current = true; };
    canvas.addEventListener("keydown", keyboardIntent);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("click", click, true);
    const clearClickZoom = () => { clickZoom.current = null; };
    m.on("dragstart", clearClickZoom);
    m.on("zoomstart", (e) => { if (e.originalEvent) clearClickZoom(); });
    canvas.addEventListener("wheel", wheel, { passive: false, capture: true });
    canvas.addEventListener("gesturestart", gestureStart, { passive: false });
    canvas.addEventListener("gesturechange", gestureChange, { passive: false });
    canvas.addEventListener("gestureend", gestureEnd, { passive: false });
    // Inspectable camera metadata, with no per-frame React state update.
    const describeCamera = () => {
      element.dataset.longitude = m.getCenter().lng.toFixed(4);
      element.dataset.latitude = m.getCenter().lat.toFixed(4);
      element.dataset.bearing = String(m.getBearing());
      element.dataset.roll = String(m.getRoll());
      element.dataset.zoom = m.getZoom().toFixed(3);
      element.dataset.view = m.getZoom() > 4 ? "detail" : "globe";
    };
    let overview = true;
    const describeOverview = () => {
      const minimum = overviewZoom(element.clientWidth, element.clientHeight, m.getCenter().lat);
      const next = m.getZoom() <= minimum + .015;
      element.dataset.minimumZoom = minimum.toFixed(3);
      element.dataset.overview = String(next);
      if (overview !== next) { overview = next; latest.current.onOverviewChange(next); }
    };
    m.on("move", describeOverview);
    m.on("moveend", describeCamera);
    describeCamera();
    describeOverview();
    // Development evidence for the pause lifecycle, without React updates.
    if (process.env.NODE_ENV !== "production") {
      let renders = 0;
      m.on("render", () => { element.dataset.renderCount = String(++renders); });
    }
    const visibleLevels = new Map<string, boolean>();
    const failedLevels = new Set<string>();
    let rasterFrame = 0;
    const refreshRaster = () => {
      rasterFrame = 0;
      if (disposed || isPaused()) return;
      const active = new Set(activeRasterLevels(m.getZoom()).map(level => level.id));
      element.dataset.activeRasterSources = [...active].join(",");
      for (const level of RASTER_LEVELS) {
        if (!m.getLayer(level.id)) continue;
        const ready = active.has(level.id) && !failedLevels.has(level.id) && m.isSourceLoaded(level.id);
        if (visibleLevels.get(level.id) === ready) continue;
        visibleLevels.set(level.id, ready);
        m.setPaintProperty(level.id, "raster-opacity-transition", { duration: ready ? 450 : 0 });
        m.setPaintProperty(level.id, "raster-opacity", ready ? 1 : 0);
      }
      element.dataset.imagery = [...visibleLevels].filter(([,v]) => v).map(([id]) => id).join(",") || "overview";
    };
    const queueRaster = () => {
      if (disposed || isPaused()) return;
      if (!rasterFrame) rasterFrame = requestAnimationFrame(refreshRaster);
    };
    m.on("sourcedata", e => {
      // A later successful load must recover from a transient tile error.
      if (e.sourceDataType === "content" && e.coord) failedLevels.delete(e.sourceId);
      queueRaster();
    });
    m.on("sourcedataloading", queueRaster);
    m.on("move", queueRaster);
    m.on("error", e => {
      if ("sourceId" in e && RASTER_LEVELS.some(level => level.id === e.sourceId)) {
        failedLevels.add(e.sourceId as string);
        queueRaster();
      }
    });
    let previousSize = { width: element.clientWidth, height: element.clientHeight };
    const syncViewport = () => {
      if (disposed || isPaused()) return;
      const width=element.clientWidth, height=element.clientHeight;
      if (!width || !height || (width===previousSize.width && height===previousSize.height)) return;
      const zoom=m.getZoom();
      const adjustment=viewportZoom(width,height)-viewportZoom(previousSize.width,previousSize.height);
      previousSize={width,height};
      m.resize();
      if (zoom < 4) { cancelArrival.current(); m.jumpTo({zoom:zoom+adjustment}); }
      // Resizing clears WebGL's drawing buffer. Paint in this same task so the
      // browser never composites a cleared canvas between resize and its RAF.
      m.redraw();
      element.dataset.resizeCount=String(Number(element.dataset.resizeCount || 0)+1);
    };
    const observer = new ResizeObserver(() => {
      if (latest.current.paused || !element.clientWidth || !element.clientHeight) return;
      if(element.clientWidth===previousSize.width && element.clientHeight===previousSize.height && !resizing) return;
      clearTimeout(resizeTimer);
      if(!resizing) { resizing=true; updateActivity.current(); }
      resizeTimer=setTimeout(()=>{resizing=false; updateActivity.current();},150);
    });
    observer.observe(element);
    let warmTimer: ReturnType<typeof setTimeout> | undefined;
    let warming = new AbortController();
    let flightWarmUntil = 0;
    let lastMovingWarm = -Infinity;
    let previousZoom = m.getZoom();
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const canWarm = () => !disposed && !document.hidden && !isPaused() && !connection?.saveData;
    const warmView = (center: [number, number], bounds: [number, number, number, number], zoom: number) => {
      // A selected destination can begin warming in the same event that closes
      // the search dialog, before React has committed paused=false.
      if (disposed || document.hidden || connection?.saveData) return;
      warming.abort();
      warming = new AbortController();
      const target = Math.min(14, Math.max(0, Math.round(zoom + 1)));
      const parent = Math.max(0, target - 1);
      prewarmTiles([
        ...neighbouringTiles(center, bounds, Math.max(0, target - 2), 4),
        ...neighbouringTiles(center, bounds, parent, 20),
        ...neighbouringTiles(center, bounds, target, 81),
      ], warming.signal);
    };
    const scheduleWarm = () => {
      clearTimeout(warmTimer);
      if (!canWarm()) return;
      warmTimer = setTimeout(() => {
        if (!canWarm()) return;
        const b = m.getBounds();
        warmView(m.getCenter().toArray(), [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], m.getZoom());
      }, 500);
    };
    const warmWhileMoving = () => {
      const zoom = m.getZoom();
      const delta = zoom - previousZoom;
      previousZoom = zoom;
      const now = performance.now();
      if (!canWarm() || now < flightWarmUntil || now - lastMovingWarm < 240) return;
      lastMovingWarm = now;
      const b = m.getBounds();
      const bounds: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const center = m.getCenter().toArray();
      const tiles = Math.abs(delta) > .0001
        ? zoomAheadTiles(center, bounds, zoom, Math.sign(delta))
        : neighbouringTiles(center, bounds, Math.min(14, Math.max(0, Math.round(zoom + 1))), 81);
      // Small rolling budget during gestures; the idle ring gets a fuller pass.
      prewarmTiles(tiles, warming.signal, 12);
      element.dataset.prewarm = Math.abs(delta) > .0001 ? "zoom" : "pan";
    };
    m.on("move", warmWhileMoving);
    m.on("moveend", scheduleWarm);
    warmDestination.current = place => {
      flightWarmUntil = performance.now() + 1750;
      const camera = m.cameraForBounds(place.bounds, { padding: 100, maxZoom: 11 });
      warmView(place.center, place.bounds, camera?.zoom ?? 9);
    };
    let breathing: ReturnType<typeof setTimeout> | undefined;
    let breathValue = .42;
    let brightening = true;
    let breathSegment: { from: number; to: number; startedAt: number } | null = null;
    const breathDuration = 2200;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const glowSources = ["glow-wide", "glow-near", "glow-local"];
    const glowOpacity = (source: string, peak: number): ExpressionSpecification => source === "glow-wide"
      ? ["interpolate", ["linear"], ["zoom"], 0, peak, 4.5, peak, 5.5, 0]
      : source === "glow-near"
        ? ["interpolate", ["linear"], ["zoom"], 4, 0, 5, peak, 7, peak, 8, 0]
        : ["interpolate", ["linear"], ["zoom"], 5.5, 0, 7, peak];
    const paintBreath = (value: number, duration: number) => {
      for (const source of glowSources) {
        if (!m.getLayer(source + "-fill")) continue;
        m.setPaintProperty(source + "-fill", "fill-opacity-transition", { duration, delay: 0 });
        m.setPaintProperty(source + "-fill", "fill-opacity", glowOpacity(source, value));
      }
      element.dataset.glowTarget = value.toFixed(2);
      element.dataset.glowTransitionMs = String(duration);
    };
    const stopBreathing = () => {
      clearTimeout(breathing);
      breathing = undefined;
      if (!breathSegment) return;
      // Match MapLibre's cubic easing to freeze at the current brightness.
      // Stopping only the timer would leave its native paint transition running
      // behind the writing sheet for up to another half-cycle.
      const t = Math.max(0, Math.min(1, (performance.now() - breathSegment.startedAt) / breathDuration));
      const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      breathValue = breathSegment.from + (breathSegment.to - breathSegment.from) * eased;
      breathSegment = null;
      paintBreath(breathValue, 0);
    };
    const breathe = () => {
      if (disposed || document.hidden || isPaused() || m.isMoving()) return;
      const target = brightening ? .68 : .20;
      breathSegment = { from: breathValue, to: target, startedAt: performance.now() };
      // Only submit an endpoint every 2.2 s. Camera-only opacity expressions
      // support native per-frame interpolation; feature colour stays unchanged.
      paintBreath(target, breathDuration);
      breathing = setTimeout(() => {
        breathing = undefined;
        breathValue = target;
        breathSegment = null;
        brightening = !brightening;
        breathe();
      }, breathDuration);
    };
    const resumeBreathing = () => {
      stopBreathing();
      if (disposed || isPaused() || document.hidden || m.isMoving() || !m.getLayer("region-fill")) return;
      if (motionPreference.matches) { breathValue = .52; paintBreath(breathValue, 0); }
      else breathe();
    };
    m.on("movestart", stopBreathing);
    m.on("moveend", resumeBreathing);
    updateActivity.current = () => {
      element.dataset.paused = String(isPaused());
      element.dataset.resizing = String(resizing);
      if (isPaused()) {
        cancelArrival.current();
        m.stop();
        m.keyboard.disable();
        m.touchZoomRotate.disable();
        cancelAnimationFrame(pulse.current);
        cancelAnimationFrame(inputFrame);
        cancelAnimationFrame(rasterFrame);
        inputFrame = rasterFrame = 0;
        panX = panY = zoomDelta = 0;
        safariScale = null;
        drag = null;
        for (const id of pinch.points.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        pinch.clear();
        clearTimeout(warmTimer);
        warming.abort();
      } else {
        syncViewport();
        m.keyboard.enable();
        m.keyboard.disableRotation();
        m.touchZoomRotate.disable();
        warming = new AbortController();
        queueRaster();
        scheduleWarm();
      }
      resumeBreathing();
    };
    document.addEventListener("visibilitychange", resumeBreathing);
    motionPreference.addEventListener("change", resumeBreathing);
    // Local controls and boundaries must not wait for remote raster downloads.
    m.on("style.load", async () => {
      try {
        const [geo, wide, near, local] = await Promise.all([
          "/data/regions.geojson", "/data/glow-wide-soft.geojson", "/data/glow-near-soft.geojson", "/data/glow-local-soft.geojson",
        ].map(async url => {
          const response = await fetch(url);
          if (!response.ok) throw new Error("boundary");
          return response.json() as Promise<FeatureCollection>;
        }));
        if (disposed) return;
        m.addSource("regions", { type: "geojson", data: geo, promoteId: "id" });
        const levels = [["glow-wide", wide, 0, 5.5], ["glow-near", near, 4, 8], ["glow-local", local, 5.5, 24]] as const;
        for (const [source, data, low, high] of levels) {
          m.addSource(source, { type: "geojson", data, promoteId: "id" });
          const color: ExpressionSpecification = ["case", ["boolean", ["feature-state", "lit"], false],
            ["rgba", 255, 194, 99, ["min", .9, ["*", 1.3, ["get", "alpha"]]]], "rgba(255,194,99,0)"];
          m.addLayer({ id: source + "-fill", type: "fill", source, minzoom: low, maxzoom: high,
            paint: { "fill-color": color, "fill-opacity": glowOpacity(source, breathValue), "fill-opacity-transition": { duration: 0 }, "fill-antialias": false } });
        }
        // Accurate geometry stays available for hit testing. The soft glow is
        // a separate dissolved shape, with feathered fills and no bright lines.
        m.addLayer({ id: "region-fill", type: "fill", source: "regions", minzoom: 5.5,
          paint: { "fill-color": "#ffc263", "fill-opacity": ["+", .001, ["*", .13, ["coalesce", ["feature-state", "pulse"], 0]]] } });
        refreshGlows.current = () => {
          element.dataset.litRegionCount = String(places.filter(p => !!latest.current.counts[p.id]).length);
          for (const p of places) m.setFeatureState({ source: "regions", id: p.id }, { lit: !!latest.current.counts[p.id] });
          for (const [source, data] of levels) for (const feature of data.features) {
            const ids = feature.properties?.placeIds as string[];
            m.setFeatureState({ source, id: feature.properties!.id }, { lit: ids.some(id => !!latest.current.counts[id]) });
          }
        };
        refreshGlows.current();
        const hit = (point: maplibregl.PointLike): string[] => {
          const exact = m.queryRenderedFeatures(point, { layers: ["region-fill"] }).find(f => latest.current.counts[f.properties.id] > 0 || f.properties.id === selected.current);
          if (exact) return [String(exact.properties.id)];
          if (m.getZoom() >= 8) return [];
          const candidates = m.queryRenderedFeatures(point, { layers: ["glow-near-fill", "glow-wide-fill"] });
          return [...new Set(candidates.flatMap(f => {
            const ids: string[] = typeof f.properties.placeIds === "string" ? JSON.parse(f.properties.placeIds) : f.properties.placeIds;
            return ids.filter(id => latest.current.counts[id] > 0);
          }))];
        };
        const explore = (ids: string[]) => {
          element.dataset.discovered = ids.join(",");
          if (ids.length === 1) { latest.current.onPlace(ids[0], m.getZoom() >= 7); return; }
          const children = places.filter(p => ids.includes(p.id));
          const bounds = new maplibregl.LngLatBounds();
          for (const p of children) { bounds.extend([p.bounds[0], p.bounds[1]]); bounds.extend([p.bounds[2], p.bounds[3]]); }
          // Never choose one child on behalf of the visitor.
          m.fitBounds(bounds, { padding: { top: Math.min(170,element.clientHeight*.25), bottom: Math.min(95,element.clientHeight*.15), left: Math.min(75,element.clientWidth*.12), right: Math.min(75,element.clientWidth*.12) }, maxZoom: 8.3, duration: reducedMotion() ? 0 : 1100 });
        };
        const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 15, className: "region-tooltip", maxWidth: "260px" });
        m.on("movestart", () => tooltip.remove());
        canvas.addEventListener("mouseleave", () => tooltip.remove());
        m.on("click", e => {
          if (isPaused()) return;
          if (!onSurface(e.point)) return;
          tooltip.remove();
          const ids = hit(e.point);
          if (ids.length) { explore(ids); return; }
          clickZoom.current = nextClickZoom(m.getZoom(), clickZoom.current);
          m.easeTo({ center: e.lngLat, zoom: clickZoom.current, duration: reducedMotion() ? 0 : 340 });
        });
        let hoverKey = "";
        const showSummary = (ids: string[], position: maplibregl.LngLatLike) => {
          if (m.isMoving() || isPaused()) { tooltip.remove(); return; }
          const locale=latest.current.locale, t=messages[locale];
          const key = locale+ids.join(",");
          if (hoverKey === key && tooltip.isOpen()) { tooltip.setLngLat(position); return; }
          hoverKey = key;
          const members = places.filter(p => ids.includes(p.id));
          const box = document.createElement("div");
          const title = document.createElement("strong"); title.textContent = members.map(p => placeName(p,locale)).join(" · ");
          const stats = mergeStats(ids.map(id => latest.current.stats[id]).filter(Boolean));
          const count = document.createElement("small"); count.textContent = `${ids.length > 1 ? `${ids.length} ${locale==="zh"?"个地点":"places"} · ` : ""}${diaryCount(stats.count,locale)}`;
          box.append(title, count);
          if (stats.count) {
            const score = document.createElement("p"); score.textContent = `${t.score} ${stats.minScore === stats.maxScore ? stats.minScore : `${stats.minScore}–${stats.maxScore}`} ${t.points}`; box.append(score);
            for (const cost of stats.costs) {
              const line = document.createElement("p"); line.textContent = `${t.spent} ${cost.min === cost.max ? formatMoney(cost.min,cost.currency,locale) : `${formatMoney(cost.min,cost.currency,locale)}–${formatMoney(cost.max,cost.currency,locale)}`}`; box.append(line);
            }
          }
          tooltip.setLngLat(position).setDOMContent(box).addTo(m);
        };
        m.on("mousemove", e => {
          if (isPaused()) { tooltip.remove(); return; }
          const ids = hit(e.point);
          canvas.style.cursor = ids.length ? "pointer" : "grab";
          if (!ids.length) { tooltip.remove(); return; }
          showSummary(ids,e.lngLat);
        });
        const markers = new Map<string, maplibregl.Marker>();
        refreshMarkers.current = () => {
          for (const [id, marker] of markers) if (!latest.current.counts[id] && id !== selected.current) { marker.remove(); markers.delete(id); }
          for (const p of places.filter(p => p.origin === "photon" && (latest.current.counts[p.id] || p.id === selected.current))) {
            if (markers.has(p.id)) { markers.get(p.id)!.getElement().textContent = `${placeName(p,latest.current.locale)} · ${diaryCount(latest.current.counts[p.id] || 0,latest.current.locale)}`; continue; }
            const label = document.createElement("button"); label.className = "new-place-label";
            label.textContent = `${placeName(p,latest.current.locale)} · ${diaryCount(latest.current.counts[p.id] || 0,latest.current.locale)}`;
            label.addEventListener("pointerenter", () => showSummary([p.id],p.center));
            label.addEventListener("focus", () => showSummary([p.id],p.center));
            label.addEventListener("pointerleave", () => tooltip.remove());
            label.addEventListener("blur", () => tooltip.remove());
            label.addEventListener("click", e => { e.stopPropagation(); if (!isPaused()) latest.current.onPlace(p.id, true); });
            markers.set(p.id, new maplibregl.Marker({ element: label }).setLngLat(p.center).addTo(m));
          }
        };
        refreshMarkers.current();
        updateActivity.current();
        latest.current.onReady();
      } catch {
        if (!disposed) {
          setError("boundariesFailed");
          latest.current.onFailure();
        }
      }
    });
    return () => {
      disposed = true;
      observer.disconnect();
      clearTimeout(resizeTimer);
      orientOrigin.current=()=>{};
      cancelArrival.current();
      cancelAnimationFrame(pulse.current);
      cancelAnimationFrame(inputFrame);
      cancelAnimationFrame(rasterFrame);
      clearTimeout(breathing);
      document.removeEventListener("visibilitychange", resumeBreathing);
      motionPreference.removeEventListener("change", resumeBreathing);
      clearTimeout(warmTimer);
      warming.abort();
      warmDestination.current = () => {};
      updateActivity.current = () => {};
      refreshGlows.current = () => {};
      refreshMarkers.current = () => {};
      canvas.removeEventListener("keydown", keyboardIntent);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("click", click, true);
      canvas.removeEventListener("wheel", wheel, true);
      canvas.removeEventListener("gesturestart", gestureStart);
      canvas.removeEventListener("gesturechange", gestureChange);
      canvas.removeEventListener("gestureend", gestureEnd);
      map.current = null;
      m.remove();
    };
  }, []);

  useLayoutEffect(() => { if(props.paused) interacted.current=true; updateActivity.current(); }, [props.paused]);
  useEffect(() => { orientOrigin.current(); }, [props.origin,props.paused]);

  useEffect(() => {
    const m = map.current;
    if (!m?.getSource("regions")) return;
    refreshGlows.current();
    refreshMarkers.current();
  }, [props.counts,props.locale]);
  return (
    <>
      <div
        className="earth-canvas"
        ref={host}
        aria-label={messages[props.locale].mapLabel}
      />
      {error && (
        <div className="map-message" role="alert">
          {messages[props.locale][error]}
        </div>
      )}
    </>
  );
});
export default Earth;
