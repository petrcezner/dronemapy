import type { Feature, Geometry } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";
import type { ExtensionSettings } from "../../types";
import type { CountrySource } from "./country-source";
import { lngLatToMercator3857 } from "./projection";
import { CZECH_BOUNDS } from "./regions";

export interface CzechBboxSource {
  settingKey: keyof ExtensionSettings["layers"];
  service: string;
  layerId: number;
  name: string;
  /** Only the attributes rendering needs — outFields=* is 3-9× heavier. */
  outFields: string;
}

export const CZECH_BBOX_SOURCES: CzechBboxSource[] = [
  { settingKey: "czechHop", service: "HOPs", layerId: 1, name: "Population density", outFields: "OBJECTID" },
  { settingKey: "czechHop", service: "HOPs", layerId: 2, name: "Population density", outFields: "OBJECTID" },
  { settingKey: "czechGrids", service: "Gridy", layerId: 0, name: "Airport grid CTR", outFields: "OBJECTID,AGL_limit" },
  { settingKey: "czechGrids", service: "Gridy", layerId: 1, name: "Airport grid ATZ", outFields: "OBJECTID,AGL_limit" },
  { settingKey: "czechProtected", service: "chranena_uzemi", layerId: 0, name: "National park (NP)", outFields: "OBJECTID" },
  { settingKey: "czechProtected", service: "chranena_uzemi", layerId: 1, name: "CHKO zone", outFields: "OBJECTID" },
  { settingKey: "czechProtected", service: "chranena_uzemi", layerId: 2, name: "Small protected area (MZCHU)", outFields: "OBJECTID" },
  // ODOS MapServer exposes a single layer (0: Objekty_MO)
  { settingKey: "czechMilitary", service: "ODOS", layerId: 0, name: "Military object", outFields: "OBJECTID" },
];

export interface CzechZoneStyle {
  /** CSS color, official dronemap.gov.cz fill. */
  fill: string;
  /** CSS color for the polygon outline. */
  outline?: string;
  /** Draw a diagonal hatch instead of a solid fill (military objects). */
  hatch?: boolean;
}

/** Official GRID_CTR/GRID_ATZ class-break ramp on AGL_limit (aimgis.rlp.cz drawingInfo). */
export const GRID_RAMP: [number, string][] = [
  [10, "rgb(212,0,0)"],
  [20, "rgb(219,28,7)"],
  [30, "rgb(227,51,11)"],
  [40, "rgb(237,77,14)"],
  [50, "rgb(245,104,17)"],
  [60, "rgb(250,126,25)"],
  [70, "rgb(237,201,57)"],
  [80, "rgb(227,227,52)"],
  [90, "rgb(130,224,36)"],
  [100, "rgb(119,199,34)"],
  [110, "rgb(94,189,30)"],
  [120, "rgb(117,179,111)"],
];
export const GRID_OUTLINE = "rgb(110,110,110)";

/** Fill/outline colors as published by the official aimgis.rlp.cz renderers. */
const CZECH_LAYER_STYLES: Record<string, CzechZoneStyle | "grid"> = {
  "HOPs/1": { fill: "rgb(205,183,118)", outline: "rgb(209,66,0)" },
  "HOPs/2": { fill: "rgb(246,218,140)", outline: "rgb(217,83,37)" },
  "Gridy/0": "grid",
  "Gridy/1": "grid",
  "chranena_uzemi/0": { fill: "rgb(101,168,67)", outline: "rgb(0,0,0)" },
  "chranena_uzemi/1": { fill: "rgb(101,168,67)", outline: "rgb(0,0,0)" },
  "chranena_uzemi/2": { fill: "rgb(93,135,80)", outline: "rgb(0,0,0)" },
  "ODOS/0": { fill: "rgb(255,0,0)", outline: "rgb(255,0,0)", hatch: true },
};

/** Resolve the official style for a Czech feature; null for non-Czech features. */
export function getCzechStyle(
  props: Record<string, unknown> | null | undefined
): CzechZoneStyle | null {
  const key = props?._dronmap_style_key;
  if (typeof key !== "string") return null;
  const style = CZECH_LAYER_STYLES[key];
  if (!style) return null;
  if (style !== "grid") return style;

  const raw = props?.AGL_limit ?? props?.agl_limit;
  const limit = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  // unknown limit → most restrictive color, not least
  if (!Number.isFinite(limit)) {
    return { fill: GRID_RAMP[0][1], outline: GRID_OUTLINE };
  }
  for (const [max, fill] of GRID_RAMP) {
    if (limit <= max) return { fill, outline: GRID_OUTLINE };
  }
  return { fill: GRID_RAMP[GRID_RAMP.length - 1][1], outline: GRID_OUTLINE };
}

export interface CzechRestLayer {
  service: string;
  layerId: number;
  name: string;
}

export const CZECH_REST_LAYERS: CzechRestLayer[] = CZECH_BBOX_SOURCES.map(
  ({ service, layerId, name }) => ({ service, layerId, name })
);

export function buildCzechQueryUrl(
  source: CzechBboxSource,
  bounds: MapViewport["bounds"]
): string {
  const envelope = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const base = `https://aimgis.rlp.cz/server/rest/services/${source.service}/MapServer/${source.layerId}/query`;
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "true",
    outFields: source.outFields,
    // ~1m precision and ~5m generalization: visually identical at drone-map
    // zooms, but cuts multi-MB boundary layers ~9x for slow connections
    geometryPrecision: "5",
    maxAllowableOffset: "0.00005",
    f: "geojson",
    // Prague-area airport grids alone exceed 1000 squares per tile;
    // 2000 is the server's maxRecordCount
    resultRecordCount: "2000",
  });
  return `${base}?${params}`;
}

export async function fetchCzechSourceFeatures(
  source: CzechBboxSource,
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const url = buildCzechQueryUrl(source, bounds);
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const features: Feature<Geometry>[] = data?.features ?? [];
  return features.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      _dronmap_source: source.name,
      _dronmap_layer: source.settingKey,
      _dronmap_style_key: `${source.service}/${source.layerId}`,
      restriction:
        f.properties?.OMEZENI ??
        f.properties?.omezeni ??
        f.properties?.TYP ??
        "Restricted – verify on DroneMap",
    },
  }));
}

export async function queryCzechZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const { x, y } = lngLatToMercator3857(lng, lat);

  const results: ZoneInfo[] = [];

  for (const layer of CZECH_REST_LAYERS) {
    try {
      const base = `https://aimgis.rlp.cz/server/rest/services/${layer.service}/MapServer/${layer.layerId}/query`;
      const params = new URLSearchParams({
        geometry: `${x},${y}`,
        geometryType: "esriGeometryPoint",
        inSR: "3857",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "*",
        returnGeometry: "false",
        f: "json",
      });

      const res = await fetch(`${base}?${params}`);
      if (!res.ok) continue;

      const data = await res.json();
      const features = data?.features ?? [];

      for (const f of features) {
        const attrs = f.attributes ?? {};
        results.push({
          name: String(
            attrs.NAZEV ?? attrs.nazev ?? attrs.NAME ?? layer.name
          ),
          restriction: String(
            attrs.OMEZENI ??
              attrs.omezeni ??
              attrs.TYP ??
              "Restricted – verify on DroneMap"
          ),
          altitude: attrs.VYSKA
            ? String(attrs.VYSKA)
            : attrs.AGL_limit != null || attrs.agl_limit != null
              ? `Max ${attrs.AGL_limit ?? attrs.agl_limit} m AGL`
              : undefined,
          authority: "ŘLP ČR",
          source: "ŘLP ČR / AIM",
          raw: attrs,
        });
      }
    } catch {
      // continue to next layer
    }
  }

  return results;
}

export const czechCountry: CountrySource = {
  region: "CZ",
  displayName: "Czech Republic",
  bounds: CZECH_BOUNDS,
  sources: CZECH_BBOX_SOURCES.map((source) => ({
    // matches the legacy vector-loader key format byte for byte
    cacheKeyPrefix: `cz/${source.service}/${source.layerId}`,
    settingKey: source.settingKey,
    fetchForBounds: (bounds: MapViewport["bounds"]) =>
      fetchCzechSourceFeatures(source, bounds),
  })),
  // no country prefix — the panel groups these under a Czech Republic row
  layerToggles: [
    { key: "czechHop", label: "Population density" },
    { key: "czechGrids", label: "Airport grids" },
    { key: "czechProtected", label: "Protected areas" },
    { key: "czechMilitary", label: "Military" },
  ],
  getStyle: getCzechStyle,
  queryPoint: queryCzechZones,
  officialMap: { label: "DroneMap", url: "https://dronemap.gov.cz/index.php?dron" },
  attribution: { label: "ŘLP", url: "https://dronemap.gov.cz" },
};
