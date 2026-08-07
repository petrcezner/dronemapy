import { describe, it, expect } from "vitest";
import type { Feature, Geometry } from "geojson";
import {
  describePolandRestriction,
  filterPolandFeatures,
  getPolandStyle,
} from "./poland";

function airspace(type: string): Feature<Geometry> {
  return {
    type: "Feature",
    properties: { airspaceElementType: type, designator: `EP${type}1` },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [20.9, 52.1],
          [21.1, 52.1],
          [21.1, 52.3],
          [20.9, 52.1],
        ],
      ],
    },
  };
}

describe("getPolandStyle", () => {
  it("returns null for non-Polish features", () => {
    expect(getPolandStyle(null)).toBeNull();
    expect(getPolandStyle({ airspaceElementType: "P" })).toBeNull();
  });

  it("styles by airspace class", () => {
    expect(
      getPolandStyle({ _dronmap_style_key: "pl/airspace", airspaceElementType: "P" })
        ?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
    expect(
      getPolandStyle({
        _dronmap_style_key: "pl/airspace",
        airspaceElementType: "CTR",
      })?.fill
    ).toBe("rgba(234, 179, 8, 0.55)");
    expect(
      getPolandStyle({
        _dronmap_style_key: "pl/airspace",
        airspaceElementType: "TSA",
      })?.fill
    ).toBe("rgba(249, 115, 22, 0.55)");
  });
});

describe("filterPolandFeatures", () => {
  it("keeps only drone-relevant classes per feed", () => {
    const kept = filterPolandFeatures("static", [
      airspace("P"),
      airspace("CTR"),
      airspace("TMA"), // country-blanketing, dropped
      airspace("FIS"),
    ]);
    expect(kept.map((f) => f.properties?.airspaceElementType)).toEqual([
      "P",
      "CTR",
    ]);

    const aup = filterPolandFeatures("aup", [
      airspace("TSA"),
      airspace("TMA"),
      airspace("D"),
    ]);
    expect(aup.map((f) => f.properties?.airspaceElementType)).toEqual([
      "TSA",
      "D",
    ]);
  });

  it("drops geometry-less features", () => {
    const broken = {
      ...airspace("P"),
      geometry: null,
    } as unknown as Feature<Geometry>;
    expect(filterPolandFeatures("static", [broken])).toEqual([]);
  });
});

describe("describePolandRestriction", () => {
  it("labels known classes and falls back safely", () => {
    expect(describePolandRestriction({ airspaceElementType: "P" })).toBe(
      "Prohibited area"
    );
    expect(describePolandRestriction({ airspaceElementType: "TSA" })).toBe(
      "Temporary segregated area"
    );
    expect(describePolandRestriction({ airspaceElementType: "XX" })).toBe(
      "Restricted airspace – verify with PANSA"
    );
  });
});
