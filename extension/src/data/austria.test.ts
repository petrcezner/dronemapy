import { describe, it, expect } from "vitest";
import type { Feature, Geometry } from "geojson";
import { filterAustriaFeatures, getAustriaStyle } from "./austria";

function zone(restriction: string): Feature<Geometry> {
  return {
    type: "Feature",
    properties: { restriction },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [16.3, 48.1],
          [16.5, 48.1],
          [16.5, 48.3],
          [16.3, 48.1],
        ],
      ],
    },
  };
}

describe("getAustriaStyle", () => {
  it("returns null for non-Austrian features", () => {
    expect(getAustriaStyle(null)).toBeNull();
    expect(getAustriaStyle({ restriction: "PROHIBITED" })).toBeNull();
  });

  it("maps ED-269 restriction values to the shared palette", () => {
    expect(
      getAustriaStyle({ _dronmap_style_key: "austria", restriction: "PROHIBITED" })
        ?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
    expect(
      getAustriaStyle({
        _dronmap_style_key: "austria",
        restriction: "REQ_AUTHORISATION",
      })?.fill
    ).toBe("rgba(234, 179, 8, 0.55)");
    expect(
      getAustriaStyle({ _dronmap_style_key: "austria", restriction: "CONDITIONAL" })
        ?.fill
    ).toBe("rgba(249, 115, 22, 0.55)");
  });

  it("falls back to the generic color for unknown restriction values", () => {
    expect(
      getAustriaStyle({ _dronmap_style_key: "austria", restriction: "ODD" })
    ).toBeNull();
  });
});

describe("filterAustriaFeatures", () => {
  it("drops NO_RESTRICTION zones and geometry-less features", () => {
    const bare = zone("PROHIBITED");
    const noGeometry = {
      ...zone("PROHIBITED"),
      geometry: null,
    } as unknown as Feature<Geometry>;
    const filtered = filterAustriaFeatures([
      bare,
      zone("NO_RESTRICTION"),
      noGeometry,
    ]);
    expect(filtered).toEqual([bare]);
  });
});
