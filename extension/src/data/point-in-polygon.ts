import type { Feature, Geometry, Position } from "geojson";

function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Even-odd over all rings, so holes subtract naturally. */
function pointInPolygon(lng: number, lat: number, rings: Position[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (pointInRing(lng, lat, ring)) inside = !inside;
  }
  return inside;
}

/**
 * True when the point lies inside the feature's Polygon/MultiPolygon.
 * Used by whole-country sources (Austria, Poland) whose click queries run
 * against the already-downloaded features instead of a point-query endpoint.
 */
export function pointInFeature(
  lng: number,
  lat: number,
  feature: Feature<Geometry>
): boolean {
  const g = feature.geometry;
  if (g.type === "Polygon") return pointInPolygon(lng, lat, g.coordinates);
  if (g.type === "MultiPolygon") {
    return g.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  }
  return false;
}
