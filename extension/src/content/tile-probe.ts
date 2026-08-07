import type { MapViewport } from "../../types";
import {
  viewportFromCenterZoom,
  mercatorToLngLat,
  TILE_SIZE,
  MAPY_ZOOM_OFFSET,
} from "../data/projection";

const EARTH_RADIUS = 6378137;
const WORLD = 2 * Math.PI * EARTH_RADIUS;

export interface TileSample {
  z: number;
  x: number;
  y: number;
  rect: { left: number; top: number; width: number; height: number };
}

export interface TileCalibration {
  /** CSS pixels per mercator meter. */
  k: number;
  /** Client-x of mercator x=0 (Greenwich). */
  originX: number;
  /** Client-y of mercator y=0 (equator). */
  originY: number;
  zoom: number;
  sampleCount: number;
}

const TILE_URL_PATTERNS = [
  // api.mapy.com/v1/maptiles/<set>/<tileSize>/<z>/<x>/<y>
  /maptiles\/[^/]+\/\d+(?:@2x)?\/(\d{1,2})\/(\d+)\/(\d+)/,
  // mapserver.mapy.cz | tilecache.mapy.com — <set>/<z>-<x>-<y> (Seznam scheme;
  // the tile CDN moved from *.mapy.cz to *.mapy.com in 2026, keep matching both)
  /mapy\.(?:cz|com)\/[^/]+\/(?:retina\/)?(\d{1,2})-(\d+)-(\d+)/,
  // generic slippy .../z/x/y.png
  /\/(\d{1,2})\/(\d+)\/(\d+)(?:@2x)?\.(?:png|jpe?g|webp)/,
];

export function parseTileUrl(url: string): { z: number; x: number; y: number } | null {
  for (const pattern of TILE_URL_PATTERNS) {
    const m = url.match(pattern);
    if (!m) continue;
    const z = parseInt(m[1], 10);
    const x = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    const n = Math.pow(2, z);
    if (z >= 3 && z <= 21 && x >= 0 && x < n && y >= 0 && y < n) {
      return { z, x, y };
    }
  }
  return null;
}

/** Collect visible map-tile <img> elements from the page. */
export function collectTileSamples(doc: Document): TileSample[] {
  const samples: TileSample[] = [];
  const imgs = doc.querySelectorAll("img");
  for (const img of imgs) {
    if (!(img instanceof HTMLImageElement)) continue;
    if (!img.complete || !img.src) continue;
    const parsed = parseTileUrl(img.src);
    if (!parsed) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 32 || r.width > 2048) continue;
    // roughly square, and at least partially near the visible viewport
    if (Math.abs(r.width - r.height) > r.width * 0.02) continue;
    if (r.right < -r.width || r.left > window.innerWidth + r.width) continue;
    if (r.bottom < -r.height || r.top > window.innerHeight + r.height) continue;
    samples.push({
      ...parsed,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  }
  return samples;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Derive the screen↔mercator mapping from tile positions. Uses the majority
 * zoom level, medians across tiles to reject stale/transitioning tiles, and
 * requires the surviving tiles to agree tightly.
 */
export function calibrate(samples: TileSample[]): TileCalibration | null {
  if (samples.length === 0) return null;

  const byZoom = new Map<number, TileSample[]>();
  for (const s of samples) {
    const list = byZoom.get(s.z) ?? [];
    list.push(s);
    byZoom.set(s.z, list);
  }
  let best: TileSample[] = [];
  for (const list of byZoom.values()) {
    if (list.length > best.length) best = list;
  }
  if (best.length < 2) return null;

  const z = best[0].z;
  const tileSpan = WORLD / Math.pow(2, z);

  const ks: number[] = [];
  const originsX: number[] = [];
  const originsY: number[] = [];
  for (const s of best) {
    const k = s.rect.width / tileSpan;
    const mercWest = -WORLD / 2 + s.x * tileSpan;
    const mercNorth = WORLD / 2 - s.y * tileSpan;
    ks.push(k);
    originsX.push(s.rect.left - mercWest * k);
    originsY.push(s.rect.top + mercNorth * k);
  }

  const k = median(ks);
  const originX = median(originsX);
  const originY = median(originsY);

  // require tight agreement: scale within 2%, origins within 3px of median
  let agreeing = 0;
  for (let i = 0; i < best.length; i++) {
    if (
      Math.abs(ks[i] - k) <= k * 0.02 &&
      Math.abs(originsX[i] - originX) <= 3 &&
      Math.abs(originsY[i] - originY) <= 3
    ) {
      agreeing++;
    }
  }
  if (agreeing < 2) return null;

  // solve pixelsPerMeter(zoom) === k for whatever offset convention is active
  const zoom = Math.log2((k * WORLD) / TILE_SIZE) - MAPY_ZOOM_OFFSET;
  if (!Number.isFinite(zoom) || zoom < 2 || zoom > 22) return null;

  return { k, originX, originY, zoom, sampleCount: agreeing };
}

/**
 * Build a viewport for a client-space rect (the overlay canvas area) from a
 * tile calibration — the projector then reproduces the exact same linear
 * mercator mapping the tiles are rendered with.
 */
export function viewportFromCalibration(
  calib: TileCalibration,
  rect: { left: number; top: number; width: number; height: number }
): MapViewport {
  const centerClientX = rect.left + rect.width / 2;
  const centerClientY = rect.top + rect.height / 2;
  const mercX = (centerClientX - calib.originX) / calib.k;
  const mercY = (calib.originY - centerClientY) / calib.k;
  const center = mercatorToLngLat(mercX, mercY);
  return viewportFromCenterZoom(
    { lat: center.lat, lng: center.lng },
    calib.zoom,
    rect.width,
    rect.height
  );
}
