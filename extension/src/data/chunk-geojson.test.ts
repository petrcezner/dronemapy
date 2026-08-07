import { describe, it, expect } from "vitest";
import type { FeatureCollection } from "geojson";
import { chunkGeoJson } from "./chunk-geojson";
import { tileId } from "./grid";

const SAMPLE: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { identifier: "a" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [8.5, 47.3],
            [8.6, 47.3],
            [8.6, 47.4],
            [8.5, 47.4],
            [8.5, 47.3],
          ],
        ],
      },
    },
    {
      type: "Feature",
      properties: { identifier: "b" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [14.4, 50.0],
            [14.5, 50.0],
            [14.5, 50.1],
            [14.4, 50.1],
            [14.4, 50.0],
          ],
        ],
      },
    },
  ],
};

describe("chunkGeoJson", () => {
  it("assigns features to tile buckets", () => {
    const tiles = chunkGeoJson(SAMPLE);
    const zurichTile = tileId(47.35, 8.55);
    const pragueTile = tileId(50.05, 14.45);
    expect(tiles.get(zurichTile)?.length).toBe(1);
    expect(tiles.get(pragueTile)?.length).toBe(1);
  });

  it("duplicates features spanning multiple tiles", () => {
    const wide: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { identifier: "wide" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [8.4, 47.3],
                [8.7, 47.3],
                [8.7, 47.4],
                [8.4, 47.4],
                [8.4, 47.3],
              ],
            ],
          },
        },
      ],
    };
    const tiles = chunkGeoJson(wide);
    let total = 0;
    for (const list of tiles.values()) total += list.length;
    expect(total).toBeGreaterThan(1);
  });
});
