import { describe, it, expect } from "vitest";
import { parseTileUrl, calibrate, viewportFromCalibration, type TileSample } from "./tile-probe";
import { lngLatToPixel, mercatorToLngLat, TILE_SIZE } from "../data/projection";

const EARTH_RADIUS = 6378137;
const WORLD = 2 * Math.PI * EARTH_RADIUS;

describe("parseTileUrl", () => {
  it("parses api.mapy.com maptiles URLs", () => {
    expect(
      parseTileUrl("https://api.mapy.com/v1/maptiles/outdoor/256/14/8800/5750?apikey=x")
    ).toEqual({ z: 14, x: 8800, y: 5750 });
  });

  it("parses legacy mapserver.mapy.cz URLs", () => {
    expect(
      parseTileUrl("https://mapserver.mapy.cz/turist-m/14-8800-5750")
    ).toEqual({ z: 14, x: 8800, y: 5750 });
  });

  it("parses the tilecache.mapy.com scheme the CDN moved to in 2026", () => {
    // regression: this URL shape not matching silently killed tile
    // calibration and uniformly shifted the whole overlay
    expect(
      parseTileUrl("https://tilecache.mapy.com/base-en/14-8833-5488")
    ).toEqual({ z: 14, x: 8833, y: 5488 });
  });

  it("parses generic slippy z/x/y URLs", () => {
    expect(parseTileUrl("https://tiles.example.com/14/8800/5750.png")).toEqual({
      z: 14,
      x: 8800,
      y: 5750,
    });
  });

  it("rejects out-of-range and non-tile URLs", () => {
    expect(parseTileUrl("https://tiles.example.com/14/999999/5750.png")).toBeNull();
    expect(parseTileUrl("https://mapy.com/img/logo.png")).toBeNull();
    expect(parseTileUrl("https://cdn.example.com/1/2/3.png")).toBeNull();
  });
});

function makeTileGrid(
  z: number,
  x0: number,
  y0: number,
  originX: number,
  originY: number,
  count = 4
): TileSample[] {
  const span = WORLD / Math.pow(2, z);
  const k = TILE_SIZE / span; // integer zoom, CSS 256px tiles
  const samples: TileSample[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + (i % 2);
    const y = y0 + Math.floor(i / 2);
    const mercWest = -WORLD / 2 + x * span;
    const mercNorth = WORLD / 2 - y * span;
    samples.push({
      z,
      x,
      y,
      rect: {
        left: originX + mercWest * k,
        top: originY - mercNorth * k,
        width: span * k,
        height: span * k,
      },
    });
  }
  return samples;
}

describe("calibrate + viewportFromCalibration", () => {
  it("recovers zoom and places tile corners exactly", () => {
    const tiles = makeTileGrid(14, 8800, 5750, -120.5, 40.25);
    const calib = calibrate(tiles);
    expect(calib).not.toBeNull();
    expect(calib!.zoom).toBeCloseTo(14, 6);

    const rect = { left: 30, top: 10, width: 1000, height: 700 };
    const vp = viewportFromCalibration(calib!, rect);

    // the geographic NW corner of each tile must project to the tile's
    // on-screen position (relative to the overlay rect)
    const span = WORLD / Math.pow(2, 14);
    for (const t of tiles) {
      const corner = mercatorToLngLat(
        -WORLD / 2 + t.x * span,
        WORLD / 2 - t.y * span
      );
      const p = lngLatToPixel(corner.lng, corner.lat, vp);
      expect(p.x).toBeCloseTo(t.rect.left - rect.left, 3);
      expect(p.y).toBeCloseTo(t.rect.top - rect.top, 3);
    }
  });

  it("ignores stale tiles from another zoom level via majority vote", () => {
    const good = makeTileGrid(14, 8800, 5750, 0, 0, 4);
    const stale = makeTileGrid(13, 4400, 2875, 37, -12, 2);
    const calib = calibrate([...stale, ...good]);
    expect(calib).not.toBeNull();
    expect(calib!.zoom).toBeCloseTo(14, 6);
    expect(calib!.sampleCount).toBe(4);
  });

  it("rejects a single tile or disagreeing tiles", () => {
    const single = makeTileGrid(14, 8800, 5750, 0, 0, 1);
    expect(calibrate(single)).toBeNull();

    const disagreeing = makeTileGrid(14, 8800, 5750, 0, 0, 4);
    disagreeing[0].rect.left += 40; // one tile way off the shared grid
    disagreeing[2].rect.left -= 35;
    disagreeing[3].rect.top += 25;
    expect(calibrate(disagreeing)).toBeNull();
  });
});
