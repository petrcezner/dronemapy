import type { Feature, Geometry } from "geojson";
import type { ExtensionSettings, MapViewport, ZoneInfo } from "../../types";
import type { CountrySource, ZoneStyle } from "./country-source";
import { GERMANY_BOUNDS } from "./regions";

// DIPUL (Digitale Plattform Unbemannte Luftfahrt, DFS/BMDV) GeoServer WFS.
// The service exposes ~31 typenames covering every § 21h LuftVO zone class;
// the full set (every autobahn, rail line and power line) would blanket the
// map at drone zooms, so only the aviation/nature layers are wired in.
const GERMANY_WFS_BASE = "https://uas-betrieb.de/geoservices/dipul/wfs";

export interface GermanyWfsSource {
  settingKey: keyof ExtensionSettings["layers"];
  typename: string;
  name: string;
}

export const GERMANY_WFS_SOURCES: GermanyWfsSource[] = [
  { settingKey: "germanyAirspace", typename: "kontrollzonen", name: "Control zone" },
  { settingKey: "germanyAirspace", typename: "flugbeschraenkungsgebiete", name: "Flight restriction area" },
  { settingKey: "germanyAirspace", typename: "flughaefen", name: "Airport" },
  { settingKey: "germanyAirspace", typename: "flugplaetze", name: "Airfield" },
  { settingKey: "germanyAirspace", typename: "temporaere_betriebseinschraenkungen", name: "Temporary restriction" },
  { settingKey: "germanyMilitary", typename: "militaerische_anlagen", name: "Military installation" },
  { settingKey: "germanyNature", typename: "naturschutzgebiete", name: "Nature reserve" },
  { settingKey: "germanyNature", typename: "nationalparks", name: "National park" },
];

const GERMANY_LAYER_STYLES: Record<string, ZoneStyle> = {
  "de/kontrollzonen": { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  "de/flugbeschraenkungsgebiete": { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  "de/flughaefen": { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  "de/flugplaetze": { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  "de/temporaere_betriebseinschraenkungen": { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  "de/militaerische_anlagen": { fill: "rgb(255,0,0)", outline: "rgb(255,0,0)", hatch: true },
  "de/naturschutzgebiete": { fill: "rgb(101,168,67)", outline: "rgb(0,0,0)" },
  "de/nationalparks": { fill: "rgb(101,168,67)", outline: "rgb(0,0,0)" },
};

/** Resolve the style for a German feature; null for non-German features. */
export function getGermanyStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  const key = props?._dronmap_style_key;
  if (typeof key !== "string") return null;
  return GERMANY_LAYER_STYLES[key] ?? null;
}

export function buildGermanyWfsUrl(
  typename: string,
  bounds: MapViewport["bounds"]
): string {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    // one typename per request — the server rejects comma-joined lists + bbox
    typeNames: `dipul:${typename}`,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    // the URN CRS form uses lat,lon axis order (minLat,minLon,maxLat,maxLon)
    bbox: `${bounds.south},${bounds.west},${bounds.north},${bounds.east},urn:ogc:def:crs:EPSG::4326`,
    count: "2000",
  });
  return `${GERMANY_WFS_BASE}?${params}`;
}

/** Altitude band like "0–100 m AGL" from DIPUL's ED-269-style limit fields. */
export function describeGermanyAltitude(
  props: Record<string, unknown>
): string | undefined {
  const upper = props.upper_limit_altitude;
  const unit = props.upper_limit_unit ?? "m";
  const ref = props.upper_limit_alt_ref ?? "";
  if (upper == null || upper === "") return undefined;
  return `Max ${upper} ${unit}${ref ? ` ${ref}` : ""}`.trim();
}

function describeGermanyRestriction(
  props: Record<string, unknown>,
  fallback: string
): string {
  const legal = props.legal_ref;
  const base = fallback;
  return typeof legal === "string" && legal.length > 0
    ? `${base} (${legal})`
    : base;
}

export async function fetchGermanySourceFeatures(
  source: GermanyWfsSource,
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const res = await fetch(buildGermanyWfsUrl(source.typename, bounds));
  if (!res.ok) return [];
  const data = await res.json();
  const features: Feature<Geometry>[] = data?.features ?? [];
  return features.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      _dronmap_source: "dipul, CC-BY-ND 4.0",
      _dronmap_layer: source.settingKey,
      _dronmap_style_key: `de/${source.typename}`,
      restriction: describeGermanyRestriction(f.properties ?? {}, source.name),
    },
  }));
}

// The WFS has no point-intersect shortcut, so a small bbox around the click
// stands in for it — same tradeoff the France module makes.
const POINT_QUERY_PAD_DEG = 0.0015;

export async function queryGermanyZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const bounds = {
    west: lng - POINT_QUERY_PAD_DEG,
    south: lat - POINT_QUERY_PAD_DEG,
    east: lng + POINT_QUERY_PAD_DEG,
    north: lat + POINT_QUERY_PAD_DEG,
  };

  const perSource = await Promise.all(
    GERMANY_WFS_SOURCES.map(async (source) => {
      try {
        const res = await fetch(buildGermanyWfsUrl(source.typename, bounds));
        if (!res.ok) return [];
        const data = await res.json();
        const features: Feature<Geometry>[] = data?.features ?? [];
        return features.map((f) => {
          const props = f.properties ?? {};
          return {
            name: String(
              props.generated_name_EN ?? props.name ?? source.name
            ),
            restriction: describeGermanyRestriction(props, source.name),
            altitude: describeGermanyAltitude(props),
            authority: "DFS / BMDV",
            source: "dipul, CC-BY-ND 4.0",
            raw: props,
          } satisfies ZoneInfo;
        });
      } catch {
        return [];
      }
    })
  );

  return perSource.flat();
}

export const germanyCountry: CountrySource = {
  region: "DE",
  displayName: "Germany",
  bounds: GERMANY_BOUNDS,
  sources: GERMANY_WFS_SOURCES.map((source) => ({
    cacheKeyPrefix: `de/${source.typename}`,
    settingKey: source.settingKey,
    fetchForBounds: (bounds: MapViewport["bounds"]) =>
      fetchGermanySourceFeatures(source, bounds),
  })),
  layerToggles: [
    { key: "germanyAirspace", label: "DE – Airspace (DIPUL)" },
    { key: "germanyMilitary", label: "DE – Military" },
    { key: "germanyNature", label: "DE – Nature reserves" },
  ],
  getStyle: getGermanyStyle,
  queryPoint: queryGermanyZones,
  officialMap: { label: "DIPUL", url: "https://maptool-dipul.dfs.de/" },
  attribution: { label: "dipul, CC-BY-ND 4.0", url: "https://dipul.de" },
};
