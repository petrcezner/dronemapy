import { describe, it, expect } from "vitest";
import {
  tileId,
  tileBounds,
  tilesForBounds,
  TILE_DEG,
  boundsIntersect,
} from "./grid";

describe("grid", () => {
  it("computes stable tile id for coordinates", () => {
    const id = tileId(47.37, 8.54);
    expect(id).toBe(tileId(47.37, 8.54));
    expect(id).toContain("_");
  });

  it("returns tile bounds matching TILE_DEG", () => {
    const id = tileId(50.0, 14.0);
    const b = tileBounds(id);
    expect(b.east - b.west).toBeCloseTo(TILE_DEG, 6);
    expect(b.north - b.south).toBeCloseTo(TILE_DEG, 6);
    expect(b.west).toBeLessThanOrEqual(14.0);
    expect(b.east).toBeGreaterThan(14.0);
    expect(b.south).toBeLessThanOrEqual(50.0);
    expect(b.north).toBeGreaterThan(50.0);
  });

  it("covers viewport bounds with padding ring", () => {
    const bounds = { west: 14.0, south: 49.9, east: 14.5, north: 50.2 };
    const withoutPad = tilesForBounds(bounds, 0);
    const withPad = tilesForBounds(bounds, 1);
    expect(withPad.length).toBeGreaterThan(withoutPad.length);
    expect(withPad.length).toBeGreaterThanOrEqual(4);
  });

  it("detects bounds intersection", () => {
    const a = { west: 0, south: 0, east: 1, north: 1 };
    const b = { west: 0.5, south: 0.5, east: 1.5, north: 1.5 };
    const c = { west: 2, south: 2, east: 3, north: 3 };
    expect(boundsIntersect(a, b)).toBe(true);
    expect(boundsIntersect(a, c)).toBe(false);
  });
});
