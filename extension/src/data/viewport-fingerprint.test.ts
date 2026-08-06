import { describe, it, expect } from "vitest";
import { viewportFingerprint } from "./viewport-fingerprint";
import type { MapViewport } from "../../types";

const SAMPLE_VIEWPORT: MapViewport = {
  center: { lat: 50.08, lng: 14.43 },
  zoom: 12,
  width: 800,
  height: 600,
  bounds: { west: 14.0, south: 49.9, east: 14.8, north: 50.2 },
};

describe("viewportFingerprint", () => {
  it("returns stable fingerprint for same viewport", () => {
    const a = viewportFingerprint(SAMPLE_VIEWPORT);
    const b = viewportFingerprint({ ...SAMPLE_VIEWPORT });
    expect(a).toBe(b);
  });

  it("changes when zoom changes", () => {
    const a = viewportFingerprint(SAMPLE_VIEWPORT);
    const b = viewportFingerprint({ ...SAMPLE_VIEWPORT, zoom: 11 });
    expect(a).not.toBe(b);
  });
});
