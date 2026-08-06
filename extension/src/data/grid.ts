import type { MapViewport } from "../../types";

/** Grid cell size in degrees (~20–25 km at CH/CZ latitudes). */
export const TILE_DEG = 0.25;

export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function latLngToTileIndex(lat: number, lng: number): {
  latIdx: number;
  lngIdx: number;
} {
  return {
    latIdx: Math.floor((lat + 90) / TILE_DEG),
    lngIdx: Math.floor((lng + 180) / TILE_DEG),
  };
}

export function tileId(lat: number, lng: number): string {
  const { latIdx, lngIdx } = latLngToTileIndex(lat, lng);
  return `${latIdx}_${lngIdx}`;
}

export function tileIdFromIndices(latIdx: number, lngIdx: number): string {
  return `${latIdx}_${lngIdx}`;
}

export function parseTileId(id: string): { latIdx: number; lngIdx: number } {
  const [latIdx, lngIdx] = id.split("_").map(Number);
  return { latIdx, lngIdx };
}

export function tileBounds(tileIdStr: string): TileBounds {
  const { latIdx, lngIdx } = parseTileId(tileIdStr);
  return {
    south: latIdx * TILE_DEG - 90,
    north: (latIdx + 1) * TILE_DEG - 90,
    west: lngIdx * TILE_DEG - 180,
    east: (lngIdx + 1) * TILE_DEG - 180,
  };
}

export function tilesForBounds(
  bounds: MapViewport["bounds"],
  paddingTiles = 1
): string[] {
  const sw = latLngToTileIndex(bounds.south, bounds.west);
  const ne = latLngToTileIndex(bounds.north, bounds.east);

  const minLat = sw.latIdx - paddingTiles;
  const maxLat = ne.latIdx + paddingTiles;
  const minLng = sw.lngIdx - paddingTiles;
  const maxLng = ne.lngIdx + paddingTiles;

  const ids: string[] = [];
  for (let latIdx = minLat; latIdx <= maxLat; latIdx++) {
    for (let lngIdx = minLng; lngIdx <= maxLng; lngIdx++) {
      ids.push(tileIdFromIndices(latIdx, lngIdx));
    }
  }
  return ids;
}

export function boundsIntersect(a: TileBounds, b: TileBounds): boolean {
  return !(
    a.east < b.west ||
    a.west > b.east ||
    a.north < b.south ||
    a.south > b.north
  );
}
