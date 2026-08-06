import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  featureIntersectsBounds,
  type FeatureBBox,
  featureBBox,
} from "./feature-bbox";
import {
  latLngToTileIndex,
  tileIdFromIndices,
  tileBounds,
  TILE_DEG,
  type TileBounds,
} from "./grid";

export function tilesForFeatureBBox(bbox: FeatureBBox): string[] {
  const sw = latLngToTileIndex(bbox.minY, bbox.minX);
  const ne = latLngToTileIndex(bbox.maxY, bbox.maxX);
  const ids: string[] = [];
  for (let latIdx = sw.latIdx; latIdx <= ne.latIdx; latIdx++) {
    for (let lngIdx = sw.lngIdx; lngIdx <= ne.lngIdx; lngIdx++) {
      ids.push(tileIdFromIndices(latIdx, lngIdx));
    }
  }
  return ids;
}

export function chunkGeoJson(
  collection: FeatureCollection
): Map<string, Feature<Geometry>[]> {
  const tiles = new Map<string, Feature<Geometry>[]>();

  for (const feature of collection.features ?? []) {
    const bbox = featureBBox(feature);
    if (!bbox) continue;

    const tileIds = tilesForFeatureBBox(bbox);
    for (const id of tileIds) {
      const tileB = tileBounds(id);
      if (!featureIntersectsBounds(feature, tileB)) continue;
      let list = tiles.get(id);
      if (!list) {
        list = [];
        tiles.set(id, list);
      }
      list.push(feature);
    }
  }

  return tiles;
}

export function chunkGeoJsonToRecord(
  collection: FeatureCollection
): Record<string, Feature<Geometry>[]> {
  const map = chunkGeoJson(collection);
  const record: Record<string, Feature<Geometry>[]> = {};
  for (const [id, features] of map) {
    record[id] = features;
  }
  return record;
}

export { TILE_DEG, type TileBounds };
