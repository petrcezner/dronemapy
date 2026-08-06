import type { MapViewport } from "../../types";

const COORD_PRECISION = 4;

function roundCoord(value: number): number {
  const factor = Math.pow(10, COORD_PRECISION);
  return Math.round(value * factor) / factor;
}

export function viewportFingerprint(viewport: MapViewport): string {
  const { center, zoom, width, height, bounds } = viewport;
  return [
    roundCoord(zoom),
    roundCoord(center.lat),
    roundCoord(center.lng),
    roundCoord(bounds.west),
    roundCoord(bounds.south),
    roundCoord(bounds.east),
    roundCoord(bounds.north),
    Math.round(width),
    Math.round(height),
  ].join("|");
}
