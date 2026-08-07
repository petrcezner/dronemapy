import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Feature, Geometry } from "geojson";
import type { MapViewport } from "../../types";
import { DEFAULT_SETTINGS } from "../../types";
import type { CountrySource } from "./country-source";
import { TileFeatureCache } from "./tile-feature-cache";
import { VectorLoader } from "./vector-loader";

vi.mock("./zone-tile-cache", () => ({
  getZoneEntries: vi.fn(async () => ({})),
  putZoneEntries: vi.fn(async () => {}),
}));

import { getZoneEntries, putZoneEntries } from "./zone-tile-cache";

const mockedGet = vi.mocked(getZoneEntries);
const mockedPut = vi.mocked(putZoneEntries);

function feature(id: number): Feature<Geometry> {
  return {
    type: "Feature",
    properties: { OBJECTID: id, _dronmap_style_key: `test/${id}` },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [14.0, 50.0],
          [14.5, 50.0],
          [14.5, 50.3],
          [14.0, 50.0],
        ],
      ],
    },
  };
}

// Prague-ish viewport small enough that the 18 km fetch radius doesn't clip it
const viewport: MapViewport = {
  center: { lat: 50.08, lng: 14.43 },
  zoom: 13,
  width: 800,
  height: 600,
  bounds: { west: 14.38, south: 50.05, east: 14.48, north: 50.11 },
};

function makeCountry(
  overrides: Partial<CountrySource> & {
    fetchForBounds?: () => Promise<Feature<Geometry>[]>;
    persist?: boolean;
  } = {}
): CountrySource {
  const fetchForBounds =
    overrides.fetchForBounds ?? (async () => [feature(1)]);
  return {
    region: "CZ",
    displayName: "Testland",
    bounds: { west: 12.0, south: 48.5, east: 18.9, north: 51.1 },
    sources: [
      {
        cacheKeyPrefix: "test/source",
        settingKey: "france",
        persist: overrides.persist,
        fetchForBounds,
      },
    ],
    layerToggles: [{ key: "france", label: "Testland" }],
    queryPoint: async () => [],
    officialMap: { label: "x", url: "https://example.com" },
    attribution: { label: "x", url: "https://example.com" },
    ...overrides,
  };
}

beforeEach(() => {
  mockedGet.mockClear();
  mockedGet.mockImplementation(async () => ({}));
  mockedPut.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VectorLoader", () => {
  it("fetches active sources once and serves repeats from memory", async () => {
    const fetchForBounds = vi.fn(async () => [feature(1)]);
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds }),
    ]);

    const first = await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    expect(first.length).toBeGreaterThan(0);
    const callsAfterFirst = fetchForBounds.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    expect(fetchForBounds.mock.calls.length).toBe(callsAfterFirst);
  });

  it("returns nothing and fetches nothing outside the region", async () => {
    const fetchForBounds = vi.fn(async () => [feature(1)]);
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds }),
    ]);

    const result = await loader.loadForViewport(viewport, [], DEFAULT_SETTINGS);
    expect(result).toEqual([]);
    expect(fetchForBounds).not.toHaveBeenCalled();
  });

  it("skips sources whose layer toggle is off", async () => {
    const fetchForBounds = vi.fn(async () => [feature(1)]);
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds }),
    ]);
    const settings = {
      ...DEFAULT_SETTINGS,
      layers: { ...DEFAULT_SETTINGS.layers, france: false },
    };

    const result = await loader.loadForViewport(viewport, ["CZ"], settings);
    expect(result).toEqual([]);
    expect(fetchForBounds).not.toHaveBeenCalled();
  });

  it("serves tiles from the persistent cache without fetching", async () => {
    mockedGet.mockImplementation(async (keys: string[]) =>
      Object.fromEntries(keys.map((k) => [k, [feature(7)]]))
    );
    const fetchForBounds = vi.fn(async () => [feature(1)]);
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds }),
    ]);

    const result = await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    expect(result.length).toBeGreaterThan(0);
    expect(fetchForBounds).not.toHaveBeenCalled();
    expect(mockedPut).not.toHaveBeenCalled(); // nothing new to persist
  });

  it("prefers getLocalTiles over cache and network", async () => {
    const fetchForBounds = vi.fn(async () => [feature(1)]);
    const country = makeCountry({ fetchForBounds });
    country.getLocalTiles = async (tileIds) =>
      Object.fromEntries(tileIds.map((id) => [id, [feature(9)]]));
    const loader = new VectorLoader(new TileFeatureCache(), [country]);

    const result = await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    expect(result.length).toBeGreaterThan(0);
    expect(fetchForBounds).not.toHaveBeenCalled();
    // every tile came from local data → no persistent-cache keys requested
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("neither reads nor writes the persistent cache for persist:false sources", async () => {
    const fetchForBounds = vi.fn(async () => [feature(1)]);
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds, persist: false }),
    ]);

    await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    expect(fetchForBounds).toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it("persists freshly fetched tiles", async () => {
    const loader = new VectorLoader(new TileFeatureCache(), [makeCountry()]);
    await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    expect(mockedPut).toHaveBeenCalledTimes(1);
    const persisted = mockedPut.mock.calls[0][0];
    for (const key of Object.keys(persisted)) {
      expect(key.startsWith("test/source/")).toBe(true);
    }
  });

  it("shows a failed tile's partial data, then retries it after the delay", async () => {
    vi.useFakeTimers();
    const fetchForBounds = vi.fn(async () => {
      throw new Error("network down");
    });
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds }),
    ]);

    await loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    // tile is present (empty) so the viewport doesn't re-fetch immediately…
    expect(loader.hasDataForViewport(viewport, ["CZ"], DEFAULT_SETTINGS)).toBe(true);

    // …but after the retry window the tile is dropped for a fresh attempt
    vi.advanceTimersByTime(15_000);
    expect(loader.hasDataForViewport(viewport, ["CZ"], DEFAULT_SETTINGS)).toBe(false);
  });

  it("discards in-flight results after clearCache (generation bump)", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchForBounds = vi.fn(async () => {
      await gate;
      return [feature(1)];
    });
    const loader = new VectorLoader(new TileFeatureCache(), [
      makeCountry({ fetchForBounds }),
    ]);

    const load = loader.loadForViewport(viewport, ["CZ"], DEFAULT_SETTINGS);
    loader.clearCache(); // settings changed mid-flight
    release!();
    const result = await load;

    expect(result).toEqual([]);
    expect(loader.hasDataForViewport(viewport, ["CZ"], DEFAULT_SETTINGS)).toBe(false);
  });
});
