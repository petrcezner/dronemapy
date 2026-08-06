import type { MapViewport } from "../../types";

/** Max radius (km) around the viewport center that we fetch/render data for. */
export const MAX_FETCH_RADIUS_KM = 18;

const KM_PER_DEG_LAT = 111.32;

/** Bounding box spanning `radiusKm` in every direction from `center`. */
export function boundsFromCenterRadius(
  center: { lat: number; lng: number },
  radiusKm: number
): MapViewport["bounds"] {
  const latPad = radiusKm / KM_PER_DEG_LAT;
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180);
  const lngPad = radiusKm / Math.max(kmPerDegLng, 0.001);
  return {
    west: center.lng - lngPad,
    south: center.lat - latPad,
    east: center.lng + lngPad,
    north: center.lat + latPad,
  };
}

/** Intersect `bounds` with a `radiusKm` box around `center`, shrinking zoomed-out viewports. */
export function clampBoundsToRadius(
  bounds: MapViewport["bounds"],
  center: { lat: number; lng: number },
  radiusKm: number
): MapViewport["bounds"] {
  const radius = boundsFromCenterRadius(center, radiusKm);
  return {
    west: Math.max(bounds.west, radius.west),
    south: Math.max(bounds.south, radius.south),
    east: Math.min(bounds.east, radius.east),
    north: Math.min(bounds.north, radius.north),
  };
}

/** Below this fraction of viewport width covered by the radius box, hide zones and hint to zoom in. */
export const MIN_RADIUS_COVERAGE = 0.5;

/** Fraction of the viewport width that a radiusKm box around the center covers (can exceed 1). */
export function radiusCoverageRatio(
  viewport: MapViewport,
  radiusKm: number
): number {
  const lngSpan = viewport.bounds.east - viewport.bounds.west;
  const kmPerDegLng =
    KM_PER_DEG_LAT * Math.cos((viewport.center.lat * Math.PI) / 180);
  const viewportWidthKm = Math.max(lngSpan * kmPerDegLng, 0.001);
  return (2 * radiusKm) / viewportWidthKm;
}

/** Expand viewport bounds by a fraction for prefetch (e.g. 0.5 = 50% padding). */
export function expandBounds(
  bounds: MapViewport["bounds"],
  paddingRatio: number
): MapViewport["bounds"] {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const latPad = latSpan * paddingRatio;
  const lngPad = lngSpan * paddingRatio;
  return {
    west: bounds.west - lngPad,
    south: bounds.south - latPad,
    east: bounds.east + lngPad,
    north: bounds.north + latPad,
  };
}

/** Snap bounds to a grid so small pans reuse the same WMS/cache key. */
export function quantizeBounds(
  bounds: MapViewport["bounds"],
  zoom: number
): MapViewport["bounds"] {
  const cellDeg = Math.max(0.02, 0.8 / Math.pow(2, Math.max(zoom - 6, 0)));
  const snap = (v: number) => Math.floor(v / cellDeg) * cellDeg;
  const west = snap(bounds.west);
  const south = snap(bounds.south);
  const east = snap(bounds.east) + cellDeg;
  const north = snap(bounds.north) + cellDeg;
  return { west, south, east, north };
}

export function boundsFingerprint(bounds: MapViewport["bounds"]): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(bounds.west)},${r(bounds.south)},${r(bounds.east)},${r(bounds.north)}`;
}

export function isBoundsInside(
  inner: MapViewport["bounds"],
  outer: MapViewport["bounds"]
): boolean {
  return (
    inner.west >= outer.west &&
    inner.east <= outer.east &&
    inner.south >= outer.south &&
    inner.north <= outer.north
  );
}
