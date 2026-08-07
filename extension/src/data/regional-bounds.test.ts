import { describe, it, expect } from "vitest";
import type { MapViewport } from "../../types";
import {
  boundsFromCenterRadius,
  clampBoundsToRadius,
  expandBounds,
  isBoundsInside,
  quantizeBounds,
  radiusCoverageRatio,
  MIN_RADIUS_COVERAGE,
} from "./regional-bounds";

const BOUNDS = { west: 14, south: 49.9, east: 14.5, north: 50.1 };

function viewportWithLngSpan(lngSpanDeg: number): MapViewport {
  const center = { lat: 50, lng: 14 };
  return {
    center,
    zoom: 10,
    width: 800,
    height: 600,
    bounds: {
      west: center.lng - lngSpanDeg / 2,
      east: center.lng + lngSpanDeg / 2,
      south: center.lat - 0.1,
      north: center.lat + 0.1,
    },
  };
}

describe("regional-bounds", () => {
  it("expandBounds adds padding", () => {
    const expanded = expandBounds(BOUNDS, 0.5);
    expect(expanded.west).toBeLessThan(BOUNDS.west);
    expect(expanded.north).toBeGreaterThan(BOUNDS.north);
  });

  it("isBoundsInside detects containment", () => {
    const outer = expandBounds(BOUNDS, 1);
    expect(isBoundsInside(BOUNDS, outer)).toBe(true);
    expect(isBoundsInside(outer, BOUNDS)).toBe(false);
  });

  it("quantizeBounds snaps to grid", () => {
    const q = quantizeBounds(BOUNDS, 12);
    expect(q.west).toBeLessThanOrEqual(BOUNDS.west);
    expect(q.east).toBeGreaterThanOrEqual(BOUNDS.east);
  });

  it("boundsFromCenterRadius produces a small box around the center", () => {
    const center = { lat: 50, lng: 14 };
    const box = boundsFromCenterRadius(center, 18);
    expect(box.west).toBeLessThan(center.lng);
    expect(box.east).toBeGreaterThan(center.lng);
    expect(box.south).toBeLessThan(center.lat);
    expect(box.north).toBeGreaterThan(center.lat);
    // ~18km radius should span well under 1 degree at this latitude
    expect(box.north - box.south).toBeLessThan(0.5);
  });

  it("clampBoundsToRadius shrinks a zoomed-out viewport to the radius box", () => {
    const center = { lat: 50, lng: 14 };
    const wideBounds = { west: 5, south: 45, east: 23, north: 55 };
    const clamped = clampBoundsToRadius(wideBounds, center, 18);
    expect(clamped.west).toBeGreaterThan(wideBounds.west);
    expect(clamped.east).toBeLessThan(wideBounds.east);
    expect(clamped.south).toBeGreaterThan(wideBounds.south);
    expect(clamped.north).toBeLessThan(wideBounds.north);
  });

  it("clampBoundsToRadius leaves a zoomed-in viewport unchanged", () => {
    const center = { lat: 50, lng: 14 };
    const tight = { west: 13.99, south: 49.99, east: 14.01, north: 50.01 };
    const clamped = clampBoundsToRadius(tight, center, 18);
    expect(clamped).toEqual(tight);
  });

  it("radiusCoverageRatio is ~1 when viewport width equals the radius diameter", () => {
    // 36 km wide at lat 50: 36 / (111.32 * cos(50°)) degrees of longitude
    const lngSpan = 36 / (111.32 * Math.cos((50 * Math.PI) / 180));
    const ratio = radiusCoverageRatio(viewportWithLngSpan(lngSpan), 18);
    expect(ratio).toBeCloseTo(1, 3);
  });

  it("radiusCoverageRatio is below threshold for a country-wide viewport", () => {
    const ratio = radiusCoverageRatio(viewportWithLngSpan(8), 18);
    expect(ratio).toBeLessThan(MIN_RADIUS_COVERAGE);
  });

  it("radiusCoverageRatio exceeds threshold at city zoom", () => {
    const ratio = radiusCoverageRatio(viewportWithLngSpan(0.2), 18);
    expect(ratio).toBeGreaterThan(MIN_RADIUS_COVERAGE);
  });
});
