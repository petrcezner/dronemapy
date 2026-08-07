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

// Germany wraps around Bohemia, so its rectangle necessarily covers western
// Czechia (incl. Prague) — overlapping boxes just mean both countries fetch.
export const GERMANY_BOUNDS: RegionBounds = {
  west: 5.8,
  south: 47.2,
  east: 15.1,
  north: 55.1,
};

export const AUSTRIA_BOUNDS: RegionBounds = {
  west: 9.5,
  south: 46.3,
  east: 17.2,
  north: 49.1,
};

export const POLAND_BOUNDS: RegionBounds = {
  west: 14.1,
  south: 49.0,
  east: 24.2,
  north: 55.0,
};

export const SLOVAKIA_BOUNDS: RegionBounds = {
  west: 16.8,
  south: 47.7,
  east: 22.6,
  north: 49.7,
};

// Mainland + islands; the rectangle unavoidably covers Corsica (FR), Ticino
// (CH) and southern Austria — overlapping boxes just mean both countries fetch.
export const ITALY_BOUNDS: RegionBounds = {
  west: 6.6,
  south: 35.4,
  east: 18.6,
  north: 47.1,
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

// detectRegion lives in country-registry.ts — it iterates the registered
// countries, so this module stays a plain geometry helper with no data deps.
