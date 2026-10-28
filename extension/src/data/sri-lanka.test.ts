// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feature, MultiPolygon, Polygon } from "geojson";

const sendRuntimeMessage = vi.hoisted(() => vi.fn());
vi.mock("../shared/runtime-messaging", () => ({ sendRuntimeMessage }));

import KML from "./__fixtures__/lk-gz-sample.kml?raw";
import {
  describeSriLankaAltitude,
  getSriLankaStyle,
  parseSriLankaKml,
  resolveSriLankaCategory,
  sriLankaCountry,
} from "./sri-lanka";


function byName(features: Feature[], name: string) {
  const found = features.find((f) => f.properties?.name === name);
  if (!found) throw new Error(`fixture lacks ${name}`);
  return found;
}

describe("parseSriLankaKml", () => {
  const features = parseSriLankaKml(KML);

  it("parses every placemark, stamping source metadata", () => {
    expect(features).toHaveLength(8);
    for (const f of features) {
      expect(f.properties).toMatchObject({
        _dronmap_source: "CAA Sri Lanka",
        _dronmap_layer: "sriLanka",
        _dronmap_style_key: "lk/caa",
      });
    }
  });

  it("reads lng,lat and drops the altitude component", () => {
    const g = byName(features, "VCCT Altitude Zone").geometry as Polygon;
    expect(g.type).toBe("Polygon");
    expect(g.coordinates[0][0]).toEqual([81.152101, 8.515022]);
    expect(g.coordinates[0]).toHaveLength(5);
  });

  it("keeps the inner boundary as a hole ring", () => {
    const g = byName(features, "Hingurakgoda Authorization Zones")
      .geometry as Polygon;
    expect(g.coordinates).toHaveLength(2);
    expect(g.coordinates[1][0]).toEqual([80.969454, 8.048806]);
  });

  it("turns a MultiGeometry into a MultiPolygon", () => {
    const g = byName(features, "Harbour - CMB").geometry as MultiPolygon;
    expect(g.type).toBe("MultiPolygon");
    expect(g.coordinates).toHaveLength(2);
  });

  it("strips CDATA html and trailing whitespace from names and descriptions", () => {
    const harbour = byName(features, "Harbour - CMB");
    expect(harbour.properties?.description).toBe(
      "Restricted Zone\n\nSL Ports Authority, SLAF (0112343970)\nUNL/GND"
    );
    expect(byName(features, "SLACR").properties?.description).toBe("");
  });

  it("skips placemarks without polygon geometry", () => {
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>pin</name><styleUrl>#poly-A52714-1200-77</styleUrl>
        <Point><coordinates>80,7,0</coordinates></Point></Placemark>
    </Document></kml>`;
    expect(parseSriLankaKml(kml)).toEqual([]);
  });
});

describe("resolveSriLankaCategory", () => {
  it.each([
    ["#poly-A52714-1200-77", "restricted"],
    ["#poly-F9A825-601-77", "authorization"],
    ["#poly-FFEA00-301-77", "warning"],
    ["#poly-BDBDBD-2000-145", "altitude"],
    ["#poly-000000-1200-77", "military"],
    ["#poly-000000-1200-77-nodesc", "military"],
    ["#poly-bdbdbd-1200-77", "altitude"],
  ])("%s -> %s", (styleUrl, category) => {
    expect(resolveSriLankaCategory(styleUrl)).toBe(category);
  });

  it("falls back to restricted for unknown colors and malformed urls", () => {
    expect(resolveSriLankaCategory("#poly-123456-1200-77")).toBe("restricted");
    expect(resolveSriLankaCategory("#something-else")).toBe("restricted");
    expect(resolveSriLankaCategory(undefined)).toBe("restricted");
  });

  it("labels parsed features by category", () => {
    const features = parseSriLankaKml(KML);
    expect(byName(features, "SLACR").properties).toMatchObject({
      category: "military",
      restriction: "Military installation",
    });
    expect(byName(features, "Mattala Airport Warning Zone").properties)
      .toMatchObject({ category: "warning", restriction: "Warning zone" });
  });
});

describe("getSriLankaStyle", () => {
  it("returns null for non-Sri-Lankan features", () => {
    expect(getSriLankaStyle(null)).toBeNull();
    expect(getSriLankaStyle({ category: "restricted" })).toBeNull();
    expect(
      getSriLankaStyle({ _dronmap_style_key: "pl/airspace", category: "military" })
    ).toBeNull();
  });

  it("styles by category and hatches military installations", () => {
    const style = (category: string) =>
      getSriLankaStyle({ _dronmap_style_key: "lk/caa", category });
    expect(style("restricted")?.fill).toBe("rgba(220, 38, 38, 0.55)");
    expect(style("military")?.hatch).toBe(true);
    expect(style("altitude")?.hatch).toBeUndefined();
    expect(style("bogus")?.fill).toBe(style("restricted")?.fill);
  });
});

describe("describeSriLankaAltitude", () => {
  it("extracts the limit forms used in descriptions", () => {
    expect(describeSriLankaAltitude("SLAF<br>UNL/GND")).toBe("UNL/GND");
    expect(describeSriLankaAltitude("MOD 1NM FL300/GND")).toBe("FL300/GND");
    expect(
      describeSriLankaAltitude("Type: Airport\nMax. Altitude (m): 60, Range: 3.6KM")
    ).toBe("60m");
  });

  it("is undefined when the description carries no limit", () => {
    expect(describeSriLankaAltitude("Irrigation Department, SLAF")).toBeUndefined();
    expect(describeSriLankaAltitude("")).toBeUndefined();
  });
});

describe("sriLankaCountry", () => {
  const source = sriLankaCountry.sources[0];

  beforeEach(() => {
    sendRuntimeMessage.mockReset();
  });

  it("clips the whole-country download to each tile and retries after a failed fetch", async () => {
    sendRuntimeMessage.mockResolvedValueOnce({ kml: null });
    await expect(
      source.fetchForBounds({ west: 80.9, south: 8, east: 81, north: 8.1 })
    ).rejects.toThrow();

    sendRuntimeMessage.mockResolvedValue({ kml: KML });
    const near = await source.fetchForBounds({
      west: 80.9,
      south: 8,
      east: 81,
      north: 8.1,
    });
    expect(near.map((f) => f.properties?.name)).toEqual([
      "Hingurakgoda Authorization Zones",
    ]);

    const empty = await source.fetchForBounds({
      west: 80.0,
      south: 6.0,
      east: 80.1,
      north: 6.1,
    });
    expect(empty).toEqual([]);
    // memoized after the first success: the failed attempt plus one download
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(2);
  });

  it("answers point queries with the zone, honouring holes", async () => {
    sendRuntimeMessage.mockResolvedValue({ kml: KML });

    const inBand = await sriLankaCountry.queryPoint(80.98, 8.0472);
    expect(inBand).toHaveLength(1);
    expect(inBand[0]).toMatchObject({
      name: "Hingurakgoda Authorization Zones",
      restriction: "Authorization zone",
      altitude: "UNL/GND",
      authority: "CAA Sri Lanka",
    });

    expect(await sriLankaCountry.queryPoint(80.98, 8.05)).toEqual([]); // hole
    expect(await sriLankaCountry.queryPoint(80.0, 6.0)).toEqual([]);
  });

  it("hits a MultiPolygon member", async () => {
    sendRuntimeMessage.mockResolvedValue({ kml: KML });
    const hits = await sriLankaCountry.queryPoint(79.835, 6.955);
    expect(hits.map((h) => h.name)).toEqual(["Harbour - CMB"]);
  });

  it("returns no zones when the download fails", async () => {
    // reset module state by importing a fresh copy
    vi.resetModules();
    const fresh = await import("./sri-lanka");
    sendRuntimeMessage.mockResolvedValue({ kml: null });
    expect(await fresh.sriLankaCountry.queryPoint(80.98, 8.0472)).toEqual([]);
  });
});
