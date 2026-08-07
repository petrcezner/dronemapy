import { describe, it, expect } from "vitest";
import {
  isInsideBounds,
  SWITZERLAND_BOUNDS,
  CZECH_BOUNDS,
} from "./regions";
import { detectRegion } from "./country-registry";
import {
  lngLatToMercator,
  mercatorToLngLat,
  viewportFromCenterZoom,
  formatWmsBbox3857,
  pixelToLngLat,
  lngLatToPixel,
  createProjector,
  computeFollowTransform,
  shiftCenterByPixels,
} from "./projection";
import { buildCzechQueryUrl, CZECH_BBOX_SOURCES } from "./czech";

describe("regions", () => {
  it("detects Switzerland (no point escapes every neighbour's rectangle)", () => {
    // east of the France bbox (lng 9.6) and south of the Austria bbox (lat
    // 46.3) dodges those two, but Italy's box then necessarily covers it —
    // the CH rectangle is fully enclosed by its neighbours' rough boxes
    expect(detectRegion(46.0, 9.9)).toEqual(["CH", "IT"]);
  });

  it("detects Czech Republic (Prague also falls in neighbours' rough rectangles)", () => {
    // Germany wraps around Bohemia and Poland's box reaches west for the
    // Szczecin strip, so both rectangles necessarily cover Prague
    expect(detectRegion(50.08, 14.43)).toEqual(["CZ", "DE", "PL"]);
  });

  it("detects France", () => {
    expect(detectRegion(48.8566, 2.3522)).toEqual(["FR"]);
  });

  it("detects Germany", () => {
    expect(detectRegion(52.5, 13.4)).toEqual(["DE"]); // Berlin
  });

  it("detects Austria", () => {
    // Vienna, not Graz: Graz (lat 47.07) sits inside Italy's rough rectangle
    expect(detectRegion(48.2, 16.37)).toEqual(["AT"]);
  });

  it("detects Italy", () => {
    expect(detectRegion(41.9, 12.5)).toEqual(["IT"]); // Rome
  });

  it("detects overlapping Austrian/Italian border region", () => {
    expect(detectRegion(46.5, 11.35)).toEqual(["AT", "IT"]); // Bolzano
  });

  it("detects Poland", () => {
    expect(detectRegion(52.23, 21.01)).toEqual(["PL"]); // Warsaw
  });

  it("detects overlapping Swiss/French border region", () => {
    expect(detectRegion(46.2, 6.1)).toEqual(["CH", "FR"]);
  });

  it("detects overlapping Austrian/Slovak border region", () => {
    expect(detectRegion(48.15, 17.1)).toEqual(["AT", "SK"]); // Bratislava
  });

  it("detects outside regions", () => {
    expect(detectRegion(51.5, -0.12)).toEqual([]); // London
  });

  it("checks bounds correctly", () => {
    expect(isInsideBounds(50.0, 14.0, CZECH_BOUNDS)).toBe(true);
    expect(isInsideBounds(50.0, 14.0, SWITZERLAND_BOUNDS)).toBe(false);
  });
});

describe("projection", () => {
  it("round-trips mercator coordinates", () => {
    const original = { lng: 14.43, lat: 50.08 };
    const merc = lngLatToMercator(original.lng, original.lat);
    const back = mercatorToLngLat(merc.x, merc.y);
    expect(back.lng).toBeCloseTo(original.lng, 5);
    expect(back.lat).toBeCloseTo(original.lat, 5);
  });

  it("builds viewport from center and zoom", () => {
    const vp = viewportFromCenterZoom(
      { lat: 50.08, lng: 14.43 },
      10,
      800,
      600
    );
    expect(vp.bounds.west).toBeLessThan(vp.bounds.east);
    expect(vp.bounds.south).toBeLessThan(vp.bounds.north);
    expect(vp.center.lat).toBe(50.08);
  });

  it("converts lng/lat to pixel and back", () => {
    const vp = viewportFromCenterZoom(
      { lat: 50.08, lng: 14.43 },
      10,
      800,
      600
    );
    const pixel = lngLatToPixel(14.43, 50.08, vp);
    const back = pixelToLngLat(pixel.x, pixel.y, vp);
    expect(back.lng).toBeCloseTo(14.43, 6);
    expect(back.lat).toBeCloseTo(50.08, 6);
  });

  it("maps center to canvas center and bounds corners to canvas corners", () => {
    const vp = viewportFromCenterZoom({ lat: 47.5, lng: 8.07 }, 9, 1000, 700);
    const center = lngLatToPixel(vp.center.lng, vp.center.lat, vp);
    expect(center.x).toBeCloseTo(500, 6);
    expect(center.y).toBeCloseTo(350, 6);

    const sw = lngLatToPixel(vp.bounds.west, vp.bounds.south, vp);
    const ne = lngLatToPixel(vp.bounds.east, vp.bounds.north, vp);
    expect(sw.x).toBeCloseTo(0, 4);
    expect(sw.y).toBeCloseTo(700, 4);
    expect(ne.x).toBeCloseTo(1000, 4);
    expect(ne.y).toBeCloseTo(0, 4);
  });

  it("interpolates y in mercator space, not latitude", () => {
    // wide viewport at low zoom so the lat span is large
    const vp = viewportFromCenterZoom({ lat: 47.5, lng: 8 }, 5, 800, 800);
    const midLat = (vp.bounds.north + vp.bounds.south) / 2;
    const p = lngLatToPixel(8, midLat, vp);
    // arithmetic-mean latitude lies SOUTH of the mercator midpoint,
    // so its pixel must sit below canvas center — linear-lat code puts it at 400
    expect(p.y).toBeGreaterThan(402);
    const back = pixelToLngLat(p.x, p.y, vp);
    expect(back.lat).toBeCloseTo(midLat, 8);
  });

  it("returns finite off-canvas coords for points outside the viewport", () => {
    const vp = viewportFromCenterZoom({ lat: 50.08, lng: 14.43 }, 12, 800, 600);
    const p = lngLatToPixel(vp.bounds.west - 1, vp.bounds.south - 1, vp);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeLessThan(0);
    expect(p.y).toBeGreaterThan(600);
  });

  it("halves the mercator span per zoom level", () => {
    const c = { lat: 50.08, lng: 14.43 };
    const a = viewportFromCenterZoom(c, 8, 800, 600);
    const b = viewportFromCenterZoom(c, 9, 800, 600);
    const spanX = (vp: typeof a) =>
      lngLatToMercator(vp.bounds.east, 0).x - lngLatToMercator(vp.bounds.west, 0).x;
    expect(spanX(b)).toBeCloseTo(spanX(a) / 2, 4);
  });

  it("shiftCenterByPixels moves the projected point by exactly that many pixels", () => {
    const urlCenter = { lat: 46.6748, lng: 7.9991 };
    const zoom = 14;
    // canvas center lies 200px east of the visible center
    const adjusted = shiftCenterByPixels(urlCenter, zoom, 200, 0);
    const vp = viewportFromCenterZoom(adjusted, zoom, 1200, 800);
    const p = lngLatToPixel(urlCenter.lng, urlCenter.lat, vp);
    // the URL coordinate must now project 200px west of canvas center
    expect(p.x).toBeCloseTo(600 - 200, 4);
    expect(p.y).toBeCloseTo(400, 4);
  });

  it("formats WMS bbox in EPSG:3857", () => {
    const vp = viewportFromCenterZoom(
      { lat: 50.08, lng: 14.43 },
      8,
      512,
      512
    );
    const bbox = formatWmsBbox3857(vp);
    const parts = bbox.split(",").map(Number);
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBeLessThan(parts[2]);
    expect(parts[1]).toBeLessThan(parts[3]);
  });
});

describe("computeFollowTransform", () => {
  const W = 800;
  const H = 600;
  const drawnCenter = { lat: 50.08, lng: 14.43 };

  /** The transform must map drawn-viewport pixels onto current-viewport pixels. */
  function assertTransformMatchesProjectors(
    drawn: ReturnType<typeof viewportFromCenterZoom>,
    current: { center: { lat: number; lng: number }; zoom: number }
  ) {
    const t = computeFollowTransform(drawn, current);
    const currentVp = viewportFromCenterZoom(current.center, current.zoom, W, H);
    const drawnProject = createProjector(drawn);
    const currentProject = createProjector(currentVp);

    const samples = [
      { lng: 14.43, lat: 50.08 },
      { lng: 14.6, lat: 50.0 },
      { lng: 14.2, lat: 50.2 },
    ];
    for (const g of samples) {
      const pDrawn = drawnProject.toPixel(g.lng, g.lat);
      const pCurrent = currentProject.toPixel(g.lng, g.lat);
      expect(t.scale * pDrawn.x + t.tx).toBeCloseTo(pCurrent.x, 4);
      expect(t.scale * pDrawn.y + t.ty).toBeCloseTo(pCurrent.y, 4);
    }
    return t;
  }

  it("pan-only produces scale 1 and a pure translation", () => {
    const drawn = viewportFromCenterZoom(drawnCenter, 12, W, H);
    const t = assertTransformMatchesProjectors(drawn, {
      center: { lat: 50.1, lng: 14.5 },
      zoom: 12,
    });
    expect(t.scale).toBe(1);
    expect(Math.abs(t.tx) + Math.abs(t.ty)).toBeGreaterThan(0);
  });

  it("zoom-in by one level doubles the scale and keeps the shared center fixed", () => {
    const drawn = viewportFromCenterZoom(drawnCenter, 12, W, H);
    const t = assertTransformMatchesProjectors(drawn, {
      center: drawnCenter,
      zoom: 13,
    });
    expect(t.scale).toBe(2);
    // canvas center (the drawn center) must stay at canvas center
    expect(t.scale * (W / 2) + t.tx).toBeCloseTo(W / 2, 6);
    expect(t.scale * (H / 2) + t.ty).toBeCloseTo(H / 2, 6);
  });

  it("combined pan+zoom stays projector-exact", () => {
    const drawn = viewportFromCenterZoom(drawnCenter, 12, W, H);
    assertTransformMatchesProjectors(drawn, {
      center: { lat: 50.12, lng: 14.38 },
      zoom: 12.6,
    });
  });

});

describe("czech REST bbox", () => {
  it("builds valid ArcGIS query URL", () => {
    const bounds = { west: 14.0, south: 49.9, east: 14.8, north: 50.2 };
    const url = buildCzechQueryUrl(CZECH_BBOX_SOURCES[0], bounds);
    expect(url).toContain("MapServer");
    expect(url).toContain("geometryType=esriGeometryEnvelope");
    expect(url).toContain("f=geojson");
    expect(url).toContain("returnGeometry=true");
  });
});
