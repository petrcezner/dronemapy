import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Geometry } from "geojson";

const sendRuntimeMessage = vi.fn();
vi.mock("../shared/runtime-messaging", () => ({
  sendRuntimeMessage: (...args: unknown[]) => sendRuntimeMessage(...args),
}));

import {
  describeOpenAipAltitude,
  describeOpenAipLimit,
  fetchItalyFeaturesForBounds,
  getItalyStyle,
  italyCountry,
  italyUnavailableZone,
  openAipItemsToFeatures,
  queryItalyZones,
} from "./italy";

const BOUNDS = { west: 12.4, south: 41.8, east: 12.6, north: 41.95 };

const square: Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [12.4, 41.8],
      [12.6, 41.8],
      [12.6, 41.95],
      [12.4, 41.95],
      [12.4, 41.8],
    ],
  ],
};

beforeEach(() => {
  sendRuntimeMessage.mockReset();
});

describe("openAIP limit formatting", () => {
  it("formats limits with unit and reference datum", () => {
    expect(describeOpenAipLimit({ value: 0, unit: 1, referenceDatum: 0 })).toBe(
      "0 ft GND"
    );
    expect(describeOpenAipLimit({ value: 300, unit: 0, referenceDatum: 1 })).toBe(
      "300 m MSL"
    );
    // flight levels are unit-less by definition
    expect(describeOpenAipLimit({ value: 95, unit: 2, referenceDatum: 2 })).toBe(
      "FL95"
    );
    expect(describeOpenAipLimit(undefined)).toBeUndefined();
  });

  it("joins lower and upper limits into a range", () => {
    expect(
      describeOpenAipAltitude({
        lowerLimit: { value: 0, unit: 1, referenceDatum: 0 },
        upperLimit: { value: 5000, unit: 1, referenceDatum: 1 },
      })
    ).toBe("0 ft GND – 5000 ft MSL");
  });

  it("has no altitude when both limits are missing", () => {
    expect(describeOpenAipAltitude({})).toBeUndefined();
  });
});

describe("openAipItemsToFeatures", () => {
  it("maps drone-relevant airspace types and drops the rest", () => {
    const features = openAipItemsToFeatures([
      { name: "LI-P1", type: 3, geometry: square },
      { name: "Airway", type: 14, geometry: square }, // not drone-relevant
      { name: "No geometry", type: 3 },
    ]);
    expect(features).toHaveLength(1);
    expect(features[0].properties?.restriction).toBe("Prohibited area");
    expect(features[0].properties?._dronmap_class).toBe("prohibited");
    expect(getItalyStyle(features[0].properties)?.fill).toBe(
      "rgba(220, 38, 38, 0.55)"
    );
  });

  it("claims only its own features in the style cascade", () => {
    expect(getItalyStyle({ _dronmap_style_key: "austria" })).toBeNull();
    expect(getItalyStyle(null)).toBeNull();
  });
});

describe("fetchItalyFeaturesForBounds", () => {
  it("throws without a key, so the tile is not cached empty", async () => {
    sendRuntimeMessage.mockResolvedValue({ items: null, error: "not_configured" });
    await expect(fetchItalyFeaturesForBounds(BOUNDS)).rejects.toThrow(
      /not_configured/
    );
  });

  it("shapes the worker's openAIP items into stamped features", async () => {
    sendRuntimeMessage.mockResolvedValue({
      items: [{ name: "LI-R60", type: 1, geometry: square }],
    });
    const features = await fetchItalyFeaturesForBounds(BOUNDS);
    expect(features[0].properties?.restriction).toBe("Restricted area");
    expect(features[0].properties?._dronmap_layer).toBe("italy");
  });
});

describe("italyUnavailableZone", () => {
  it("distinguishes a missing key from a rejected one", () => {
    expect(italyUnavailableZone("not_configured").restriction).toMatch(
      /Add a free openAIP API key/
    );
    expect(italyUnavailableZone("unauthorized").restriction).toMatch(
      /rejected the API key/
    );
    expect(italyUnavailableZone("failed").restriction).toMatch(
      /could not be reached/
    );
  });
});

describe("queryItalyZones", () => {
  it("explains what to do when no key is configured", async () => {
    sendRuntimeMessage.mockResolvedValue({ items: null, error: "not_configured" });
    const zones = await queryItalyZones(12.5, 41.9);
    expect(zones).toHaveLength(1);
    expect(zones[0].restriction).toMatch(/openAIP API key/);
  });

  it("returns only zones containing the clicked point", async () => {
    sendRuntimeMessage.mockResolvedValue({
      items: [
        { name: "LI-P1", type: 3, geometry: square },
        {
          name: "Elsewhere",
          type: 3,
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [9.0, 45.0],
                [9.1, 45.0],
                [9.1, 45.1],
                [9.0, 45.1],
                [9.0, 45.0],
              ],
            ],
          },
        },
      ],
    });
    const zones = await queryItalyZones(12.5, 41.9);
    expect(zones.map((z) => z.name)).toEqual(["LI-P1"]);
    expect(zones[0].restriction).toBe("Prohibited area");
  });
});

describe("italyCountry registration", () => {
  it("exposes one toggle and the pinned cache prefix", () => {
    expect(italyCountry.layerToggles).toEqual([
      { key: "italy", label: "Italy – Airspace (openAIP, key required)" },
    ]);
    expect(italyCountry.sources.map((s) => s.cacheKeyPrefix)).toEqual([
      "it/openaip",
    ]);
  });
});
