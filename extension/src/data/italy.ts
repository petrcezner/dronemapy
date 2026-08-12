import type { Feature, Geometry } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";
import type { CountrySource, ZoneStyle } from "./country-source";
import { pointInFeature } from "./point-in-polygon";
import { ITALY_BOUNDS } from "./regions";
import { sendRuntimeMessage } from "../shared/runtime-messaging";

// Italy is the only country here with no usable official feed. ENAC/ENAV's
// d-flight platform gates every geodata endpoint behind Keycloak
// (`allowAnonUser: false`) and protects its login with a client-specific CSRF
// handshake, so third-party clients cannot reach the official UAS geo zones;
// there is no open ED-269 mirror either. What we can offer is openAIP's
// Italian *airspace* (CTR/P/R/D…), which needs a free API key the user pastes
// into the panel — the same "airspace, not geo zones" caveat as PL and SK.

const OPENAIP_SOURCE = "openAIP contributors (airspace, not UAS geo zones)";

const ITALY_STYLES: Record<string, ZoneStyle> = {
  prohibited: { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  restricted: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  conditional: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
};

/** Resolve the style for an Italian feature; null for other countries'. */
export function getItalyStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  if (props?._dronmap_style_key !== "italy") return null;
  return ITALY_STYLES[String(props?._dronmap_class ?? "")] ?? null;
}

/** openAIP airspace `type` codes that matter to a drone pilot. */
const OPENAIP_TYPE_LABELS: Record<number, string> = {
  1: "Restricted area",
  2: "Danger area",
  3: "Prohibited area",
  4: "Control zone (CTR)",
  8: "Temporary reserved area",
  9: "Temporary segregated area",
  12: "Air defense identification zone",
  13: "Aerodrome traffic zone (ATZ)",
  16: "Alert area",
  17: "Warning area",
  18: "Protected area",
  22: "Traffic information zone (TIZ)",
  28: "Low-altitude overflight restriction",
  30: "Temporary flight restriction",
};

const OPENAIP_CLASS: Record<number, string> = {
  1: "restricted",
  2: "conditional",
  3: "prohibited",
  4: "restricted",
  8: "conditional",
  9: "conditional",
  12: "restricted",
  13: "restricted",
  16: "conditional",
  17: "conditional",
  18: "conditional",
  22: "restricted",
  28: "restricted",
  30: "prohibited",
};

const OPENAIP_UNITS: Record<number, string> = { 0: "m", 1: "ft", 2: "FL" };
const OPENAIP_DATUM: Record<number, string> = { 0: "GND", 1: "MSL", 2: "STD" };

/** "0 ft GND"; flight levels render as "FL95" (unit-less by definition). */
export function describeOpenAipLimit(
  limit: Record<string, unknown> | null | undefined
): string | undefined {
  if (!limit || limit.value == null) return undefined;
  const unit = OPENAIP_UNITS[Number(limit.unit)] ?? "";
  const datum = OPENAIP_DATUM[Number(limit.referenceDatum)] ?? "";
  if (unit === "FL") return `FL${limit.value}`;
  return `${limit.value} ${unit}${datum ? ` ${datum}` : ""}`.trim();
}

export function describeOpenAipAltitude(
  props: Record<string, unknown>
): string | undefined {
  const lower = describeOpenAipLimit(
    props.lowerLimit as Record<string, unknown> | undefined
  );
  const upper = describeOpenAipLimit(
    props.upperLimit as Record<string, unknown> | undefined
  );
  if (!lower && !upper) return undefined;
  if (lower && upper) return `${lower} – ${upper}`;
  return (upper ?? lower) as string;
}

/** openAIP item -> stamped GeoJSON feature; unknown/irrelevant types dropped. */
export function openAipItemsToFeatures(items: unknown[]): Feature<Geometry>[] {
  const features: Feature<Geometry>[] = [];
  for (const raw of items) {
    const item = raw as Record<string, unknown>;
    const geometry = item?.geometry as Geometry | undefined;
    const type = Number(item?.type);
    const label = OPENAIP_TYPE_LABELS[type];
    if (!geometry || !label) continue;
    features.push({
      type: "Feature",
      geometry,
      properties: {
        ...item,
        geometry: undefined,
        name: String(item.name ?? label),
        restriction: label,
        altitude: describeOpenAipAltitude(item),
        _dronmap_source: OPENAIP_SOURCE,
        _dronmap_layer: "italy",
        _dronmap_style_key: "italy",
        _dronmap_class: OPENAIP_CLASS[type] ?? "conditional",
      },
    });
  }
  return features;
}

interface ItalyFetchResponse {
  items?: unknown[] | null;
  error?: "not_configured" | "unauthorized" | "failed";
}

export async function fetchItalyFeaturesForBounds(
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const response = await sendRuntimeMessage<ItalyFetchResponse>({
    type: "FETCH_ITALY_ZONES",
    bounds,
  });
  if (!response || !Array.isArray(response.items)) {
    // throwing (rather than returning []) keeps the tile out of the persistent
    // cache, so zones appear as soon as a key is configured
    throw new Error(`Italy unavailable: ${response?.error ?? "no response"}`);
  }
  return openAipItemsToFeatures(response.items);
}

/** Popup text for the states where we have no data to show. */
export function italyUnavailableZone(
  error: ItalyFetchResponse["error"]
): ZoneInfo {
  const restriction =
    error === "unauthorized"
      ? "openAIP rejected the API key – check it in the DroneMapy panel"
      : error === "failed"
        ? "openAIP could not be reached – try again shortly"
        : "Add a free openAIP API key in the DroneMapy panel. Official Italian geo zones: d-flight.it";
  return {
    name: "Italy – no zone data",
    restriction,
    source: "DroneMapy extension",
  };
}

const POINT_QUERY_PAD_DEG = 0.0015;

export async function queryItalyZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const bounds = {
    west: lng - POINT_QUERY_PAD_DEG,
    south: lat - POINT_QUERY_PAD_DEG,
    east: lng + POINT_QUERY_PAD_DEG,
    north: lat + POINT_QUERY_PAD_DEG,
  };

  const response = await sendRuntimeMessage<ItalyFetchResponse>({
    type: "FETCH_ITALY_ZONES",
    bounds,
  });
  if (!response || !Array.isArray(response.items)) {
    return [italyUnavailableZone(response?.error)];
  }

  return openAipItemsToFeatures(response.items)
    .filter((f) => pointInFeature(lng, lat, f))
    .map((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      return {
        name: String(props.name ?? "Italian airspace"),
        restriction: String(props.restriction ?? "Restricted airspace"),
        altitude: props.altitude ? String(props.altitude) : undefined,
        source: OPENAIP_SOURCE,
        raw: props,
      } satisfies ZoneInfo;
    });
}

export const italyCountry: CountrySource = {
  region: "IT",
  displayName: "Italy",
  bounds: ITALY_BOUNDS,
  sources: [
    {
      cacheKeyPrefix: "it/openaip",
      settingKey: "italy",
      fetchForBounds: fetchItalyFeaturesForBounds,
    },
  ],
  layerToggles: [{ key: "italy", label: "Italy – Airspace (openAIP, key required)" }],
  getStyle: getItalyStyle,
  queryPoint: queryItalyZones,
  officialMap: { label: "d-flight", url: "https://www.d-flight.it/web-app/" },
  attribution: { label: "openAIP", url: "https://www.openaip.net" },
};
