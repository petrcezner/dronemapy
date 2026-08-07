import type { Feature, Geometry } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";
import type { CountrySource, ZoneStyle } from "./country-source";
import { filterFeaturesToBounds } from "./feature-bbox";
import { pointInFeature } from "./point-in-polygon";
import { POLAND_BOUNDS } from "./regions";
import { sendRuntimeMessage } from "../shared/runtime-messaging";

// PANSA's open airspace feeds: classic airspace + the daily AUP reservations.
// This is NOT the legal DRA geozone set (that API needs a PANSA-issued key) —
// the layer is labeled "Airspace" in the UI for that reason. The endpoints
// send no CORS headers, so the service worker fetches them on our behalf
// (FETCH_POLAND_AIRSPACE); each feed is a whole-country JSON array of GeoJSON
// Features fetched once per session and clipped per tile.
export const POLAND_STATIC_URL =
  "https://airspace.pansa.pl/map-configuration/static-airspace";
export const POLAND_AUP_URL = "https://airspace.pansa.pl/map-configuration/aup";

export type PolandFeed = "static" | "aup";

// TMA/MTMA/FIS/SECTOR would blanket the country at drone-relevant zooms.
const KEEP_TYPES: Record<PolandFeed, Set<string>> = {
  static: new Set(["P", "R", "CTR", "MCTR", "ADIZ", "ATZ"]),
  aup: new Set(["TRA", "TSA", "MRT", "D", "ATZ", "NPZ", "R", "ADHOC"]),
};

const POLAND_TYPE_LABELS: Record<string, string> = {
  P: "Prohibited area",
  R: "Restricted area",
  CTR: "Control zone",
  MCTR: "Military control zone",
  ADIZ: "Air defense identification zone",
  ATZ: "Aerodrome traffic zone",
  TRA: "Temporary reserved area",
  TSA: "Temporary segregated area",
  MRT: "Military route",
  D: "Danger area",
  NPZ: "No-fly zone",
  ADHOC: "Ad-hoc reservation",
};

const POLAND_TYPE_STYLES: Record<string, ZoneStyle> = {
  P: { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  R: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  CTR: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  MCTR: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  ADIZ: { fill: "rgba(147, 51, 234, 0.45)", outline: "rgb(120,40,190)" },
  ATZ: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  TRA: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  TSA: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  MRT: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  D: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
  NPZ: { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  ADHOC: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
};

/** Resolve the style for a Polish feature; null for non-Polish features. */
export function getPolandStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  if (props?._dronmap_style_key !== "pl/airspace") return null;
  return POLAND_TYPE_STYLES[String(props?.airspaceElementType ?? "")] ?? null;
}

export function describePolandRestriction(
  props: Record<string, unknown>
): string {
  const type = String(props.airspaceElementType ?? "");
  return POLAND_TYPE_LABELS[type] ?? "Restricted airspace – verify with PANSA";
}

function describePolandAltitude(
  props: Record<string, unknown>
): string | undefined {
  const lower = props.lowerAltitude;
  const upper = props.upperAltitude;
  if (lower == null && upper == null) return undefined;
  return `${lower ?? "?"} – ${upper ?? "?"}`;
}

function stampPolandFeature(f: Feature<Geometry>): Feature<Geometry> {
  return {
    ...f,
    properties: {
      ...f.properties,
      _dronmap_source: "PAŻP / PANSA",
      _dronmap_layer: "poland",
      _dronmap_style_key: "pl/airspace",
      restriction: describePolandRestriction(f.properties ?? {}),
    },
  };
}

/** Keep only drone-relevant airspace classes with usable geometry. */
export function filterPolandFeatures(
  feed: PolandFeed,
  features: Feature<Geometry>[]
): Feature<Geometry>[] {
  const keep = KEEP_TYPES[feed];
  return features.filter(
    (f) =>
      f?.geometry != null &&
      keep.has(String(f.properties?.airspaceElementType ?? ""))
  );
}

const feedPromises: Partial<Record<PolandFeed, Promise<Feature<Geometry>[]>>> = {};

function loadPolandFeed(feed: PolandFeed): Promise<Feature<Geometry>[]> {
  let promise = feedPromises[feed];
  if (!promise) {
    promise = (async () => {
      const response = await sendRuntimeMessage<{
        features?: Feature<Geometry>[] | null;
      }>({ type: "FETCH_POLAND_AIRSPACE", feed });
      const features = response?.features;
      if (!Array.isArray(features)) {
        throw new Error(`Poland ${feed} airspace fetch failed`);
      }
      return filterPolandFeatures(feed, features).map(stampPolandFeature);
    })().catch((err) => {
      // let the loader's failed-tile retry trigger a fresh fetch
      feedPromises[feed] = undefined;
      throw err;
    });
    feedPromises[feed] = promise;
  }
  return promise;
}

async function fetchPolandFeedForBounds(
  feed: PolandFeed,
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const all = await loadPolandFeed(feed);
  return filterFeaturesToBounds(all, bounds);
}

export async function queryPolandZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const feeds = await Promise.all(
    (["static", "aup"] as PolandFeed[]).map((feed) =>
      loadPolandFeed(feed).catch(() => [] as Feature<Geometry>[])
    )
  );
  return feeds
    .flat()
    .filter((f) => pointInFeature(lng, lat, f))
    .map((f) => {
      const props = f.properties ?? {};
      return {
        name: String(props.designator ?? props.name ?? "Polish airspace"),
        restriction: describePolandRestriction(props),
        altitude: describePolandAltitude(props),
        authority: "PAŻP / PANSA",
        source: "PAŻP / PANSA (airspace.pansa.pl)",
        raw: props,
      } satisfies ZoneInfo;
    });
}

export const polandCountry: CountrySource = {
  region: "PL",
  displayName: "Poland",
  bounds: POLAND_BOUNDS,
  sources: [
    {
      cacheKeyPrefix: "pl/static",
      settingKey: "poland",
      fetchForBounds: (bounds: MapViewport["bounds"]) =>
        fetchPolandFeedForBounds("static", bounds),
    },
    {
      cacheKeyPrefix: "pl/aup",
      settingKey: "poland",
      // the AUP is a daily plan — a week-long persistent cache would show
      // stale reservations as active
      persist: false,
      fetchForBounds: (bounds: MapViewport["bounds"]) =>
        fetchPolandFeedForBounds("aup", bounds),
    },
  ],
  layerToggles: [{ key: "poland", label: "PL – Airspace (PANSA)" }],
  getStyle: getPolandStyle,
  queryPoint: queryPolandZones,
  officialMap: { label: "DroneMap PL", url: "https://dronemap.pansa.pl" },
  attribution: { label: "PAŻP / PANSA", url: "https://airspace.pansa.pl" },
};
