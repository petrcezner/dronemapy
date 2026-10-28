import type { Feature, Geometry, Polygon, Position } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";
import type { CountrySource, ZoneStyle } from "./country-source";
import { filterFeaturesToBounds } from "./feature-bbox";
import { pointInFeature } from "./point-in-polygon";
import { SRI_LANKA_BOUNDS } from "./regions";
import { sendRuntimeMessage } from "../shared/runtime-messaging";

// The CAA map (portal.caa.lk/drone/map.html) renders this KML client-side.
// The server sends no CORS headers, so the service worker fetches the text
// (FETCH_SRI_LANKA_ZONES) and it is parsed here — service workers have no
// DOMParser. LK-GZ1.kml is a strict subset of this file by name, and
// LK-GZ-SLN.kml is not shown on the official map, so only LK-GZ.kml is used.
export const SRI_LANKA_KML_URL =
  "https://portal.caa.lk/drone/kml-proxy.php?file=LK-GZ.kml";

export type SriLankaZoneCategory =
  | "restricted"
  | "authorization"
  | "warning"
  | "altitude"
  | "military";

const FALLBACK_CATEGORY: SriLankaZoneCategory = "restricted";

const CATEGORY_LABELS: Record<SriLankaZoneCategory, string> = {
  restricted: "Restricted zone",
  authorization: "Authorization zone",
  warning: "Warning zone",
  altitude: "Altitude-limit zone",
  military: "Military installation",
};

const CATEGORY_STYLES: Record<SriLankaZoneCategory, ZoneStyle> = {
  restricted: { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  authorization: { fill: "rgba(249, 168, 37, 0.55)", outline: "rgb(200,130,10)" },
  warning: { fill: "rgba(255, 234, 0, 0.5)", outline: "rgb(180,160,0)" },
  altitude: { fill: "rgba(158, 158, 158, 0.5)", outline: "rgb(97,97,97)" },
  military: { fill: "rgba(60, 60, 60, 0.6)", outline: "rgb(20,20,20)", hatch: true },
};

// The KML encodes the zone class only as the hex color in each placemark's
// styleUrl (`#poly-<RRGGBB>-<width>-<alpha>[-nodesc]`).
const CATEGORY_BY_COLOR: Record<string, SriLankaZoneCategory> = {
  A52714: "restricted",
  F9A825: "authorization",
  FFEA00: "warning",
  BDBDBD: "altitude",
  "000000": "military",
};

export function resolveSriLankaCategory(
  styleUrl: string | null | undefined
): SriLankaZoneCategory {
  const color = /^#poly-([0-9a-f]{6})-/i.exec(styleUrl ?? "")?.[1];
  return (color && CATEGORY_BY_COLOR[color.toUpperCase()]) || FALLBACK_CATEGORY;
}

/** Resolve the style for a Sri Lankan feature; null for non-Sri-Lankan features. */
export function getSriLankaStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  if (props?._dronmap_style_key !== "lk/caa") return null;
  const category = String(props?.category ?? "") as SriLankaZoneCategory;
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES[FALLBACK_CATEGORY];
}

function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  const text =
    new DOMParser().parseFromString(withBreaks, "text/html").body.textContent ??
    "";
  return text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function childText(el: Element, tag: string): string {
  for (const child of Array.from(el.children)) {
    if (child.tagName === tag) return child.textContent ?? "";
  }
  return "";
}

// KML coordinates are whitespace-separated "lng,lat[,alt]" tuples
function parseRing(coordinates: string): Position[] {
  const ring: Position[] = [];
  for (const tuple of coordinates.trim().split(/\s+/)) {
    const [lng, lat] = tuple.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) ring.push([lng, lat]);
  }
  return ring;
}

function parsePolygon(el: Element): Position[][] | null {
  const rings: Position[][] = [];
  const boundaries = Array.from(el.children).filter(
    (c) => c.tagName === "outerBoundaryIs" || c.tagName === "innerBoundaryIs"
  );
  // outer ring must lead; KML does not guarantee child order
  boundaries.sort(
    (a, b) =>
      Number(b.tagName === "outerBoundaryIs") -
      Number(a.tagName === "outerBoundaryIs")
  );
  for (const boundary of boundaries) {
    const ring = parseRing(
      boundary.getElementsByTagName("coordinates")[0]?.textContent ?? ""
    );
    if (ring.length >= 4) rings.push(ring);
    else if (boundary.tagName === "outerBoundaryIs") return null;
  }
  return rings.length > 0 ? rings : null;
}

function parseGeometry(placemark: Element): Geometry | null {
  const polygons: Position[][][] = [];
  const collect = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (child.tagName === "Polygon") {
        const rings = parsePolygon(child);
        if (rings) polygons.push(rings);
      } else if (child.tagName === "MultiGeometry") {
        collect(child);
      }
    }
  };
  collect(placemark);
  if (polygons.length === 0) return null;
  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0] } satisfies Polygon;
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

/** Parse the CAA KML into stamped GeoJSON features; placemarks without a polygon are skipped. */
export function parseSriLankaKml(kml: string): Feature<Geometry>[] {
  const doc = new DOMParser().parseFromString(kml, "text/xml");
  const features: Feature<Geometry>[] = [];
  for (const placemark of Array.from(doc.getElementsByTagName("Placemark"))) {
    const geometry = parseGeometry(placemark);
    if (!geometry) continue;
    const category = resolveSriLankaCategory(
      childText(placemark, "styleUrl").trim()
    );
    features.push({
      type: "Feature",
      geometry,
      properties: {
        name: htmlToText(childText(placemark, "name")),
        description: htmlToText(childText(placemark, "description")),
        category,
        restriction: CATEGORY_LABELS[category],
        _dronmap_source: "CAA Sri Lanka",
        _dronmap_layer: "sriLanka",
        _dronmap_style_key: "lk/caa",
      },
    });
  }
  return features;
}

/** Altitude limit quoted in a zone description, when it carries one. */
export function describeSriLankaAltitude(
  description: string
): string | undefined {
  const max = /Max\.?\s*Altitude\s*\(m\)\s*:\s*(\d+)/i.exec(description);
  if (max) return `${max[1]}m`;
  return /\b(UNL|FL\d+|\d+\s?m)\s*\/\s*GND\b/i
    .exec(description)?.[0]
    .replace(/\s+/g, "");
}

let zonesPromise: Promise<Feature<Geometry>[]> | null = null;

function loadSriLankaZones(): Promise<Feature<Geometry>[]> {
  if (!zonesPromise) {
    zonesPromise = (async () => {
      const response = await sendRuntimeMessage<{ kml?: string | null }>({
        type: "FETCH_SRI_LANKA_ZONES",
      });
      if (typeof response?.kml !== "string") {
        throw new Error("Sri Lanka zone download failed");
      }
      return parseSriLankaKml(response.kml);
    })().catch((err) => {
      // let the loader's failed-tile retry trigger a fresh fetch
      zonesPromise = null;
      throw err;
    });
  }
  return zonesPromise;
}

export function sriLankaZonesInfo(
  features: Feature<Geometry>[],
  lng: number,
  lat: number
): ZoneInfo[] {
  return features
    .filter((f) => pointInFeature(lng, lat, f))
    .map((f) => {
      const props = f.properties ?? {};
      const description = String(props.description ?? "");
      return {
        name: String(props.name || "Sri Lanka zone"),
        restriction: String(props.restriction ?? CATEGORY_LABELS.restricted),
        altitude: describeSriLankaAltitude(description),
        authority: "CAA Sri Lanka",
        source: "CAA Sri Lanka (portal.caa.lk)",
        raw: props,
      } satisfies ZoneInfo;
    });
}

export const sriLankaCountry: CountrySource = {
  region: "LK",
  displayName: "Sri Lanka",
  bounds: SRI_LANKA_BOUNDS,
  sources: [
    {
      cacheKeyPrefix: "lk/caa",
      settingKey: "sriLanka",
      fetchForBounds: async (bounds: MapViewport["bounds"]) =>
        filterFeaturesToBounds(await loadSriLankaZones(), bounds),
    },
  ],
  layerToggles: [{ key: "sriLanka", label: "Sri Lanka (CAA)" }],
  getStyle: getSriLankaStyle,
  queryPoint: async (lng, lat) =>
    sriLankaZonesInfo(
      await loadSriLankaZones().catch(() => [] as Feature<Geometry>[]),
      lng,
      lat
    ),
  officialMap: {
    label: "CAA Sri Lanka drone map",
    url: "https://portal.caa.lk/drone/map.html",
  },
  attribution: {
    label: "© Civil Aviation Authority of Sri Lanka",
    url: "https://portal.caa.lk/drone/map.html",
  },
};
