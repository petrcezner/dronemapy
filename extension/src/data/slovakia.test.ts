import { describe, it, expect } from "vitest";
import {
  buildSlovakiaQueryUrl,
  describeSlovakiaAltitude,
  describeSlovakiaRestriction,
  getSlovakiaStyle,
} from "./slovakia";

describe("buildSlovakiaQueryUrl", () => {
  const bounds = { west: 17.05, south: 48.1, east: 17.3, north: 48.3 };

  it("builds a filtered ArcGIS geojson bbox query", () => {
    const url = buildSlovakiaQueryUrl(bounds);
    expect(url).toContain(
      "https://gis.lps.sk/server/rest/services/Airspaces/FeatureServer/0/query"
    );
    expect(url).toContain("f=geojson");
    expect(url).toContain("geometryType=esriGeometryEnvelope");
    expect(url).toContain("inSR=4326");
    expect(url).toContain("returnGeometry=true");
  });

  it("always constrains TYPE_CODE (unfiltered responses blanket the country)", () => {
    const where = new URL(buildSlovakiaQueryUrl(bounds)).searchParams.get("where");
    expect(where).toContain("TYPE_CODE IN");
    expect(where).toContain("'P'");
    expect(where).toContain("'R-AMC'");
    expect(where).not.toContain("'FIR'");
  });
});

describe("getSlovakiaStyle", () => {
  it("returns null for non-Slovak features", () => {
    expect(getSlovakiaStyle(null)).toBeNull();
    expect(getSlovakiaStyle({ TYPE_CODE: "P" })).toBeNull();
  });

  it("styles by TYPE_CODE", () => {
    expect(
      getSlovakiaStyle({ _dronmap_style_key: "sk/airspace", TYPE_CODE: "P" })?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
    expect(
      getSlovakiaStyle({ _dronmap_style_key: "sk/airspace", TYPE_CODE: "PROTECT" })
        ?.fill
    ).toBe("rgb(101,168,67)");
  });
});

describe("describeSlovakiaRestriction", () => {
  it("labels known codes and falls back safely", () => {
    expect(describeSlovakiaRestriction({ TYPE_CODE: "P" })).toBe(
      "Prohibited area"
    );
    expect(describeSlovakiaRestriction({ TYPE_CODE: "R-AMC" })).toBe(
      "Restricted area (AMC-managed)"
    );
    expect(describeSlovakiaRestriction({ TYPE_CODE: "FIR" })).toBe(
      "Restricted airspace – verify with LPS SR"
    );
  });
});

describe("describeSlovakiaAltitude", () => {
  it("formats the vertical band with units", () => {
    expect(
      describeSlovakiaAltitude({
        DISTVERTLOWER_VAL: 0,
        DISTVERTLOWER_UOM: "FT",
        DISTVERTUPPER_VAL: 8000,
        DISTVERTUPPER_UOM: "FT",
      })
    ).toBe("0 FT – 8000 FT");
  });

  it("returns undefined without vertical limits", () => {
    expect(describeSlovakiaAltitude({})).toBeUndefined();
  });
});
