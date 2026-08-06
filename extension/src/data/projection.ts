import type { MapViewport } from "../../types";

const EARTH_RADIUS = 6378137;
const MAX_LAT = 85.05112878;

export const TILE_SIZE = 256;

/**
 * mapy.com's URL `z` uses the standard slippy 256px-tile zoom convention.
 * Verified empirically against mapy.com's own scale bar (z=12 at lat 50 renders
 * ~41 px/km, matching 256·2^z; the 512px MapLibre convention would give ~82).
 * If mapy.com ever changes engines, recalibrate with the debug crosshair
 * (localStorage "dronmap-debug" = "1") and landmarks near screen edges.
 */
export const MAPY_ZOOM_OFFSET = 0;

/** Pixels per mercator meter at a given mapy.com URL zoom. */
function pixelsPerMeter(zoom: number): number {
  return (TILE_SIZE * Math.pow(2, zoom + MAPY_ZOOM_OFFSET)) / (2 * Math.PI * EARTH_RADIUS);
}

export function lngLatToMercator(lng: number, lat: number): { x: number; y: number } {
  const clampedLat = Math.max(Math.min(lat, MAX_LAT), -MAX_LAT);
  const x = (lng * Math.PI * EARTH_RADIUS) / 180;
  const y =
    Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360)) * EARTH_RADIUS;
  return { x, y };
}

export function mercatorToLngLat(x: number, y: number): { lng: number; lat: number } {
  const lng = (x / EARTH_RADIUS) * (180 / Math.PI);
  const lat =
    (180 / Math.PI) * (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2);
  return { lng, lat };
}

export function viewportFromCenterZoom(
  center: { lat: number; lng: number },
  zoom: number,
  width: number,
  height: number
): MapViewport {
  const scale = pixelsPerMeter(zoom);
  const centerMerc = lngLatToMercator(center.lng, center.lat);
  const halfW = width / (2 * scale);
  const halfH = height / (2 * scale);

  const westSouth = mercatorToLngLat(centerMerc.x - halfW, centerMerc.y - halfH);
  const eastNorth = mercatorToLngLat(centerMerc.x + halfW, centerMerc.y + halfH);

  return {
    center,
    zoom,
    width,
    height,
    bounds: {
      west: westSouth.lng,
      south: westSouth.lat,
      east: eastNorth.lng,
      north: eastNorth.lat,
    },
  };
}

/** Shift a geographic center by screen pixels (east/south positive) at a given zoom. */
export function shiftCenterByPixels(
  center: { lat: number; lng: number },
  zoom: number,
  dxPx: number,
  dyPx: number
): { lat: number; lng: number } {
  const scale = pixelsPerMeter(zoom);
  const merc = lngLatToMercator(center.lng, center.lat);
  const shifted = mercatorToLngLat(merc.x + dxPx / scale, merc.y - dyPx / scale);
  return { lat: shifted.lat, lng: shifted.lng };
}

export interface ViewportProjector {
  /** Never null; result may lie outside the canvas for off-viewport points. */
  toPixel(lng: number, lat: number): { x: number; y: number };
  toLngLat(x: number, y: number): { lng: number; lat: number };
}

/**
 * Viewport-scoped Web Mercator projector. Pixel y is linear in mercator-y
 * (NOT latitude) — matching how the underlying map actually renders.
 */
export function createProjector(viewport: MapViewport): ViewportProjector {
  const scale = pixelsPerMeter(viewport.zoom);
  const centerMerc = lngLatToMercator(viewport.center.lng, viewport.center.lat);
  const halfW = viewport.width / 2;
  const halfH = viewport.height / 2;

  return {
    toPixel(lng: number, lat: number) {
      const merc = lngLatToMercator(lng, lat);
      return {
        x: halfW + (merc.x - centerMerc.x) * scale,
        y: halfH - (merc.y - centerMerc.y) * scale,
      };
    },
    toLngLat(x: number, y: number) {
      return mercatorToLngLat(
        centerMerc.x + (x - halfW) / scale,
        centerMerc.y - (y - halfH) / scale
      );
    },
  };
}

export function lngLatToPixel(
  lng: number,
  lat: number,
  viewport: MapViewport
): { x: number; y: number } {
  return createProjector(viewport).toPixel(lng, lat);
}

export function pixelToLngLat(
  x: number,
  y: number,
  viewport: MapViewport
): { lng: number; lat: number } {
  return createProjector(viewport).toLngLat(x, y);
}

export interface FollowTransform {
  tx: number;
  ty: number;
  scale: number;
}

/**
 * CSS transform (origin 0 0) that repositions a canvas drawn for `drawn` so
 * it aligns with the map at `current` center/zoom. Exact for Web Mercator
 * pan and (fractional) zoom.
 */
export function computeFollowTransform(
  drawn: MapViewport,
  current: { center: { lat: number; lng: number }; zoom: number }
): FollowTransform {
  const scale = Math.pow(2, current.zoom - drawn.zoom);
  const p = createProjector(drawn).toPixel(current.center.lng, current.center.lat);
  return {
    scale,
    tx: drawn.width / 2 - scale * p.x,
    ty: drawn.height / 2 - scale * p.y,
  };
}

export function lngLatToMercator3857(lng: number, lat: number): { x: number; y: number } {
  return lngLatToMercator(lng, lat);
}

export function formatWmsBbox3857(viewport: MapViewport): string {
  const sw = lngLatToMercator(viewport.bounds.west, viewport.bounds.south);
  const ne = lngLatToMercator(viewport.bounds.east, viewport.bounds.north);
  return `${sw.x},${sw.y},${ne.x},${ne.y}`;
}
