import { describe, it, expect } from "vitest";
import {
  buildGermanyWfsUrl,
  describeGermanyAltitude,
  getGermanyStyle,
  GERMANY_WFS_SOURCES,
} from "./germany";

describe("buildGermanyWfsUrl", () => {
  const bounds = { west: 13.0, south: 52.3, east: 13.6, north: 52.6 };

  it("requests a single dipul typename as GeoJSON", () => {
    const url = buildGermanyWfsUrl("kontrollzonen", bounds);
    expect(url).toContain("https://uas-betrieb.de/geoservices/dipul/wfs");
    expect(url).toContain("typeNames=dipul%3Akontrollzonen");
    expect(url).toContain("outputFormat=application%2Fjson");
    expect(url).toContain("version=2.0.0");
  });

  it("uses the URN CRS with lat,lon axis order in the bbox", () => {
    const url = buildGermanyWfsUrl("flughaefen", bounds);
    const bbox = new URL(url).searchParams.get("bbox");
    // minLat,minLon,maxLat,maxLon — NOT lon-first
    expect(bbox).toBe("52.3,13,52.6,13.6,urn:ogc:def:crs:EPSG::4326");
  });
});

describe("getGermanyStyle", () => {
  it("returns null for non-German features", () => {
    expect(getGermanyStyle(null)).toBeNull();
    expect(getGermanyStyle({ _dronmap_style_key: "france" })).toBeNull();
    expect(getGermanyStyle({ _dronmap_style_key: "de/unknown" })).toBeNull();
  });

  it("styles control zones amber and restriction areas red", () => {
    expect(
      getGermanyStyle({ _dronmap_style_key: "de/kontrollzonen" })?.fill
    ).toBe("rgba(234, 179, 8, 0.55)");
    expect(
      getGermanyStyle({ _dronmap_style_key: "de/flugbeschraenkungsgebiete" })
        ?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
  });

  it("hatches military installations", () => {
    expect(
      getGermanyStyle({ _dronmap_style_key: "de/militaerische_anlagen" })?.hatch
    ).toBe(true);
  });
});

describe("GERMANY_WFS_SOURCES", () => {
  it("covers exactly the three German layer toggles", () => {
    expect(new Set(GERMANY_WFS_SOURCES.map((s) => s.settingKey))).toEqual(
      new Set(["germanyAirspace", "germanyMilitary", "germanyNature"])
    );
  });
});

describe("describeGermanyAltitude", () => {
  it("formats the upper limit with unit and reference", () => {
    expect(
      describeGermanyAltitude({
        upper_limit_altitude: 100,
        upper_limit_unit: "m",
        upper_limit_alt_ref: "AGL",
      })
    ).toBe("Max 100 m AGL");
  });

  it("returns undefined without a limit", () => {
    expect(describeGermanyAltitude({})).toBeUndefined();
  });
});
