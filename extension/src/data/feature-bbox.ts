import type { Feature, Geometry } from "geojson";
import type { TileBounds } from "./grid";

export interface FeatureBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// bbox is recomputed for every feature on every render pass — memoize it,
// keyed weakly so cached features don't leak
const bboxCache = new WeakMap<Feature<Geometry>, FeatureBBox | null>();

export function featureBBox(
  feature: Feature<Geometry>
): FeatureBBox | null {
  const cached = bboxCache.get(feature);
  if (cached !== undefined) return cached;

  const g = feature.geometry;
  let coords: number[][] = [];
  if (g.type === "Polygon") coords = g.coordinates[0] ?? [];
  else if (g.type === "MultiPolygon") {
    coords = g.coordinates.flatMap((p) => p[0] ?? []);
  } else {
    bboxCache.set(feature, null);
    return null;
  }
  if (coords.length === 0) {
    bboxCache.set(feature, null);
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lng, lat] of coords) {
    minX = Math.min(minX, lng);
    minY = Math.min(minY, lat);
    maxX = Math.max(maxX, lng);
    maxY = Math.max(maxY, lat);
  }
  const bbox = { minX, minY, maxX, maxY };
  bboxCache.set(feature, bbox);
  return bbox;
}

export function featureIntersectsBounds(
  feature: Feature<Geometry>,
  bounds: TileBounds
): boolean {
  const b = featureBBox(feature);
  if (!b) return false;
  return !(
    b.maxX < bounds.west ||
    b.minX > bounds.east ||
    b.maxY < bounds.south ||
    b.minY > bounds.north
  );
}

export function filterFeaturesToBounds<T extends Feature<Geometry>>(
  features: T[],
  bounds: TileBounds
): T[] {
  return features.filter((f) => featureIntersectsBounds(f, bounds));
}

export function featureDedupeKey(feature: Feature<Geometry>): string {
  const props = feature.properties ?? {};
  const id =
    props.identifier ??
    props.OBJECTID ??
    props.objectid ??
    props.FID ??
    props.id;
  // OBJECTIDs are only unique within one source layer — scope the key so a
  // grid square can't collide with a military object sharing the same id
  const scope = props._dronmap_style_key ? `${props._dronmap_style_key}:` : "";
  if (id != null) return `${scope}${id}`;
  const b = featureBBox(feature);
  if (!b) return JSON.stringify(feature.geometry);
  return `${b.minX.toFixed(5)},${b.minY.toFixed(5)},${b.maxX.toFixed(5)},${b.maxY.toFixed(5)}`;
}

export function dedupeFeatures(
  features: Feature<Geometry>[]
): Feature<Geometry>[] {
  const seen = new Set<string>();
  const out: Feature<Geometry>[] = [];
  for (const f of features) {
    const key = featureDedupeKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
