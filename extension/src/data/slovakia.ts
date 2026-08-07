import type { Feature, Geometry } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";
import type { CountrySource, ZoneStyle } from "./country-source";
import { SLOVAKIA_BOUNDS } from "./regions";

// LPS SR (Air Navigation Services of the Slovak Republic) VFR Manual ArcGIS.
// This is the classic airspace layer (P/R/CTR/TRA…), not the NSAT UAS geo
// zones — those exist only as a KML-in-ZIP behind an unstable URL. The layer
// is clearly labeled "Airspace" in the UI for that reason.
const SLOVAKIA_QUERY_BASE =
  "https://gis.lps.sk/server/rest/services/Airspaces/FeatureServer/0/query";

// Without this filter, country-blanketing FIR/CTA/SECTOR polygons make every
// bbox response ~4 MB.
const SLOVAKIA_TYPE_CODES = [
  "P",
  "R",
  "R-AMC",
  "D",
  "CTR",
  "TRA",
  "W",
  "PROTECT",
];

const SLOVAKIA_WHERE = `TYPE_CODE IN (${SLOVAKIA_TYPE_CODES.map((c) => `'${c}'`).join(",")})`;

/** Only the attributes rendering and popups need — outFields=* is far heavier. */
const SLOVAKIA_OUT_FIELDS =
  "IDENT_TXT,NAME_TXT,TYPE_CODE,DISTVERTLOWER_VAL,DISTVERTLOWER_UOM,DISTVERTUPPER_VAL,DISTVERTUPPER_UOM,WORKHR_CODE,ACTIVITY_CODE";

const SLOVAKIA_TYPE_LABELS: Record<string, string> = {
  P: "Prohibited area",
  R: "Restricted area",
  "R-AMC": "Restricted area (AMC-managed)",
  D: "Danger area",
  CTR: "Control zone",
  TRA: "Temporary reserved area",
  W: "Warning area",
  PROTECT: "Protected area",
};

const SLOVAKIA_TYPE_STYLES: Record<string, ZoneStyle> = {
  P: { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  R: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  "R-AMC": { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  D: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  CTR: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  TRA: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  W: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  PROTECT: { fill: "rgb(101,168,67)", outline: "rgb(0,0,0)" },
};

/** Resolve the style for a Slovak feature; null for non-Slovak features. */
export function getSlovakiaStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  if (props?._dronmap_style_key !== "sk/airspace") return null;
  return SLOVAKIA_TYPE_STYLES[String(props?.TYPE_CODE ?? "")] ?? null;
}

export function describeSlovakiaAltitude(
  props: Record<string, unknown>
): string | undefined {
  const lower = props.DISTVERTLOWER_VAL;
  const upper = props.DISTVERTUPPER_VAL;
  if (lower == null && upper == null) return undefined;
  const fmt = (v: unknown, uom: unknown) =>
    v == null ? "?" : `${v}${uom ? ` ${uom}` : ""}`;
  return `${fmt(lower, props.DISTVERTLOWER_UOM)} – ${fmt(upper, props.DISTVERTUPPER_UOM)}`;
}

export function describeSlovakiaRestriction(
  props: Record<string, unknown>
): string {
  const type = String(props.TYPE_CODE ?? "");
  return SLOVAKIA_TYPE_LABELS[type] ?? "Restricted airspace – verify with LPS SR";
}

export function buildSlovakiaQueryUrl(bounds: MapViewport["bounds"]): string {
  const params = new URLSearchParams({
    where: SLOVAKIA_WHERE,
    geometry: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "true",
    outFields: SLOVAKIA_OUT_FIELDS,
    geometryPrecision: "5",
    maxAllowableOffset: "0.00005",
    f: "geojson",
    resultRecordCount: "2000",
  });
  return `${SLOVAKIA_QUERY_BASE}?${params}`;
}

export async function fetchSlovakiaFeaturesForBounds(
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const res = await fetch(buildSlovakiaQueryUrl(bounds));
  if (!res.ok) return [];
  const data = await res.json();
  const features: Feature<Geometry>[] = data?.features ?? [];
  return features.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      _dronmap_source: "VFR Manual, LPS SR š. p.",
      _dronmap_layer: "slovakia",
      _dronmap_style_key: "sk/airspace",
      restriction: describeSlovakiaRestriction(f.properties ?? {}),
    },
  }));
}

export async function querySlovakiaZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const params = new URLSearchParams({
    where: SLOVAKIA_WHERE,
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
  });

  try {
    const res = await fetch(`${SLOVAKIA_QUERY_BASE}?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    const features: { attributes?: Record<string, unknown> }[] =
      data?.features ?? [];
    return features.map((f) => {
      const attrs = f.attributes ?? {};
      return {
        name: String(attrs.NAME_TXT ?? attrs.IDENT_TXT ?? "Slovak airspace"),
        restriction: describeSlovakiaRestriction(attrs),
        altitude: describeSlovakiaAltitude(attrs),
        authority: "LPS SR",
        source: "VFR Manual, LPS SR š. p.",
        raw: attrs,
      } satisfies ZoneInfo;
    });
  } catch {
    return [];
  }
}

export const slovakiaCountry: CountrySource = {
  region: "SK",
  displayName: "Slovakia",
  bounds: SLOVAKIA_BOUNDS,
  sources: [
    {
      cacheKeyPrefix: "sk/airspace",
      settingKey: "slovakia",
      fetchForBounds: fetchSlovakiaFeaturesForBounds,
    },
  ],
  layerToggles: [{ key: "slovakia", label: "SK – Airspace (LPS SR)" }],
  getStyle: getSlovakiaStyle,
  queryPoint: querySlovakiaZones,
  officialMap: { label: "VFR Manual SK", url: "https://gis.lps.sk/vfrm" },
  attribution: { label: "VFR Manual, LPS SR š. p.", url: "https://gis.lps.sk/vfrm" },
};
