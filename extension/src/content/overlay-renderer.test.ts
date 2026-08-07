import { describe, it, expect } from "vitest";
import type { Geometry } from "geojson";
import { polygonRingGroups } from "./overlay-renderer";

describe("polygonRingGroups", () => {
  const outer = [
    [14.0, 50.0],
    [14.2, 50.0],
    [14.2, 50.2],
    [14.0, 50.0],
  ];
  const hole = [
    [14.05, 50.05],
    [14.1, 50.05],
    [14.1, 50.1],
    [14.05, 50.05],
  ];

  it("keeps a polygon's holes grouped with its outer ring", () => {
    // grouped rings are filled as ONE even-odd path — flattening them used to
    // paint enclave holes (e.g. Waitzdorf in the Saxon Switzerland NP) solid
    const geom: Geometry = { type: "Polygon", coordinates: [outer, hole] };
    expect(polygonRingGroups(geom)).toEqual([[outer, hole]]);
  });

  it("returns one group per MultiPolygon part", () => {
    const geom: Geometry = {
      type: "MultiPolygon",
      coordinates: [[outer, hole], [outer]],
    };
    const groups = polygonRingGroups(geom);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual([outer, hole]);
    expect(groups[1]).toEqual([outer]);
  });

  it("returns nothing for non-area geometries", () => {
    expect(polygonRingGroups({ type: "Point", coordinates: [14, 50] })).toEqual(
      []
    );
  });
});
