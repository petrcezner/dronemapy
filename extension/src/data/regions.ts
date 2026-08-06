import type { CountryRegion, Region } from "../../types";

export interface RegionBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const SWITZERLAND_BOUNDS: RegionBounds = {
  west: 5.9,
  south: 45.8,
  east: 10.5,
  north: 47.8,
};

export const CZECH_BOUNDS: RegionBounds = {
  west: 12.0,
  south: 48.5,
  east: 18.9,
  north: 51.1,
};

// Metropolitan France; overlaps SWITZERLAND_BOUNDS along the shared border
// (both boxes are rough rectangles, not the actual borders).
export const FRANCE_BOUNDS: RegionBounds = {
  west: -5.2,
  south: 41.3,
  east: 9.6,
  north: 51.1,
};

export function isInsideBounds(
  lat: number,
  lng: number,
  bounds: RegionBounds
): boolean {
  return (
    lng >= bounds.west &&
    lng <= bounds.east &&
    lat >= bounds.south &&
    lat <= bounds.north
  );
}

export function detectRegion(lat: number, lng: number): CountryRegion {
  const regions: Region[] = [];
  if (isInsideBounds(lat, lng, SWITZERLAND_BOUNDS)) regions.push("CH");
  if (isInsideBounds(lat, lng, CZECH_BOUNDS)) regions.push("CZ");
  if (isInsideBounds(lat, lng, FRANCE_BOUNDS)) regions.push("FR");
  return regions;
}
