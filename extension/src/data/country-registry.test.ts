import { describe, it, expect } from "vitest";
import {
  activeSourcesFor,
  COUNTRY_BY_REGION,
  COUNTRY_SOURCES,
  resolveFeatureStyle,
} from "./country-registry";
import { DEFAULT_SETTINGS } from "../../types";

describe("registry invariants", () => {
  it("registers every Region exactly once, in cascade order", () => {
    expect(COUNTRY_SOURCES.map((c) => c.region)).toEqual([
      "CH",
      "CZ",
      "FR",
      "DE",
      "AT",
      "PL",
      "SK",
      "IT",
    ]);
    for (const country of COUNTRY_SOURCES) {
      expect(COUNTRY_BY_REGION[country.region]).toBe(country);
    }
  });

  it("keeps cache-key prefixes unique across all sub-sources", () => {
    const prefixes = COUNTRY_SOURCES.flatMap((c) =>
      c.sources.map((s) => s.cacheKeyPrefix)
    );
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("pins the pre-registry cache-key prefixes (IndexedDB compatibility)", () => {
    // users' persisted zone caches are keyed on these — never change them
    const prefixes = COUNTRY_SOURCES.flatMap((c) =>
      c.sources.map((s) => s.cacheKeyPrefix)
    );
    expect(prefixes).toContain("ch/identify");
    expect(prefixes).toContain("cz/HOPs/1");
    expect(prefixes).toContain("cz/Gridy/0");
    expect(prefixes).toContain("cz/chranena_uzemi/0");
    expect(prefixes).toContain("cz/ODOS/0");
    expect(prefixes).toContain("fr/uas");
    expect(prefixes).toContain("it/openaip");
  });

  it("only references real settings layer keys", () => {
    const known = Object.keys(DEFAULT_SETTINGS.layers);
    for (const country of COUNTRY_SOURCES) {
      for (const sub of country.sources) {
        expect(known).toContain(sub.settingKey);
      }
      for (const toggle of country.layerToggles) {
        expect(known).toContain(toggle.key);
      }
    }
  });
});

describe("resolveFeatureStyle", () => {
  it("routes each country's style key to its own style", () => {
    expect(
      resolveFeatureStyle({ _dronmap_style_key: "HOPs/1" })?.fill
    ).toBe("rgb(205,183,118)");
    expect(
      resolveFeatureStyle({ _dronmap_style_key: "france", limite: "Vol interdit" })
        ?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
    expect(
      resolveFeatureStyle({ _dronmap_style_key: "de/nationalparks" })?.fill
    ).toBe("rgb(101,168,67)");
    expect(
      resolveFeatureStyle({
        _dronmap_style_key: "austria",
        restriction: "PROHIBITED",
      })?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
    expect(
      resolveFeatureStyle({
        _dronmap_style_key: "pl/airspace",
        airspaceElementType: "P",
      })?.outline
    ).toBe("rgb(180,0,0)");
    expect(
      resolveFeatureStyle({ _dronmap_style_key: "sk/airspace", TYPE_CODE: "CTR" })
        ?.fill
    ).toBe("rgba(234, 179, 8, 0.55)");
    expect(
      resolveFeatureStyle({
        _dronmap_style_key: "italy",
        _dronmap_class: "prohibited",
      })?.fill
    ).toBe("rgba(220, 38, 38, 0.55)");
  });

  it("returns null for Swiss/unknown features (generic fallback)", () => {
    expect(resolveFeatureStyle({ zone_restriction_en: "Prohibited" })).toBeNull();
    expect(resolveFeatureStyle({ _dronmap_style_key: "nope" })).toBeNull();
    expect(resolveFeatureStyle(null)).toBeNull();
  });
});

describe("activeSourcesFor", () => {
  const layers = { ...DEFAULT_SETTINGS.layers };

  it("returns nothing outside all regions", () => {
    expect(activeSourcesFor([], layers)).toEqual([]);
  });

  it("unions all matching countries' sub-sources", () => {
    const active = activeSourcesFor(["AT", "SK"], layers);
    const regions = new Set(active.map((a) => a.country.region));
    expect(regions).toEqual(new Set(["AT", "SK"]));
  });

  it("filters sub-sources by their layer toggle", () => {
    const withoutGrids = { ...layers, czechGrids: false };
    const active = activeSourcesFor(["CZ"], withoutGrids);
    expect(active.length).toBeGreaterThan(0);
    expect(active.some((a) => a.sub.settingKey === "czechGrids")).toBe(false);
    expect(active.some((a) => a.sub.settingKey === "czechHop")).toBe(true);
  });

  it("treats a missing layer key as enabled (settings predating the country)", () => {
    const legacy = { ...layers } as Record<string, boolean>;
    delete legacy.germanyAirspace;
    const active = activeSourcesFor(
      ["DE"],
      legacy as typeof DEFAULT_SETTINGS.layers
    );
    expect(active.some((a) => a.sub.settingKey === "germanyAirspace")).toBe(true);
  });
});
