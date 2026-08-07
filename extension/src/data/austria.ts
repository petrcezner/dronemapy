import type { Feature, Geometry } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";
import type { CountrySource, ZoneStyle } from "./country-source";
import { filterFeaturesToBounds } from "./feature-bbox";
import { pointInFeature } from "./point-in-polygon";
import { AUSTRIA_BOUNDS } from "./regions";

// Austro Control publishes no bbox-queryable API; the dronespace.at viewer's
// country-wide GeoJSON (~3.6 MB, ~300 features) is fetched once per session
// and clipped per tile client-side. Warm persistent tile caches never trigger
// the download at all.
export const AUSTRIA_GEOJSON_URL = "https://utm.dronespace.at/avm/utm/uas.geojson";

const AUSTRIA_STYLES: Record<string, ZoneStyle> = {
  PROHIBITED: { fill: "rgba(220, 38, 38, 0.55)", outline: "rgb(180,0,0)" },
  REQ_AUTHORISATION: { fill: "rgba(234, 179, 8, 0.55)", outline: "rgb(180,140,0)" },
  CONDITIONAL: { fill: "rgba(249, 115, 22, 0.55)", outline: "rgb(200,90,10)" },
};

/** Resolve the style for an Austrian feature; null for non-Austrian features. */
export function getAustriaStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  if (props?._dronmap_style_key !== "austria") return null;
  return AUSTRIA_STYLES[String(props?.restriction ?? "")] ?? null;
}

function stampAustriaFeature(f: Feature<Geometry>): Feature<Geometry> {
  return {
    ...f,
    properties: {
      ...f.properties,
      _dronmap_source: "Austro Control / dronespace.at",
      _dronmap_layer: "austria",
      _dronmap_style_key: "austria",
    },
  };
}

/** Keep only features that actually restrict flying. */
export function filterAustriaFeatures(
  features: Feature<Geometry>[]
): Feature<Geometry>[] {
  return features.filter(
    (f) => f.geometry != null && f.properties?.restriction !== "NO_RESTRICTION"
  );
}

let austriaFeaturesPromise: Promise<Feature<Geometry>[]> | null = null;

function loadAustriaFeatures(): Promise<Feature<Geometry>[]> {
  if (!austriaFeaturesPromise) {
    austriaFeaturesPromise = (async () => {
      const res = await fetch(AUSTRIA_GEOJSON_URL);
      if (!res.ok) {
        throw new Error(`Austria zone download failed: ${res.status}`);
      }
      const data = await res.json();
      const features: Feature<Geometry>[] = data?.features ?? [];
      return filterAustriaFeatures(features).map(stampAustriaFeature);
    })().catch((err) => {
      // let the loader's failed-tile retry trigger a fresh download
      austriaFeaturesPromise = null;
      throw err;
    });
  }
  return austriaFeaturesPromise;
}

export async function fetchAustriaFeaturesForBounds(
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const all = await loadAustriaFeatures();
  return filterFeaturesToBounds(all, bounds);
}

function describeAustriaAltitude(
  props: Record<string, unknown>
): string | undefined {
  const lower = props.lowerMeters ?? props.lower;
  const upper = props.upperMeters ?? props.upper;
  if (lower == null && upper == null) return undefined;
  const fmt = (v: unknown) => (typeof v === "number" ? `${v} m` : String(v));
  if (lower != null && upper != null) return `${fmt(lower)} – ${fmt(upper)}`;
  return fmt(upper ?? lower);
}

function austriaAuthorityName(props: Record<string, unknown>): string | undefined {
  const authority = props.zoneAuthority;
  const first = Array.isArray(authority) ? authority[0] : authority;
  const name = (first as Record<string, unknown> | undefined)?.name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

export async function queryAustriaZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  try {
    const all = await loadAustriaFeatures();
    return all
      .filter((f) => pointInFeature(lng, lat, f))
      .map((f) => {
        const props = f.properties ?? {};
        return {
          name: String(props.name ?? "Austrian UAS geo zone"),
          restriction: String(
            props.restriction ?? "Restricted – verify on dronespace.at"
          ),
          altitude: describeAustriaAltitude(props),
          authority: austriaAuthorityName(props),
          source: "Austro Control / dronespace.at",
          raw: props,
        } satisfies ZoneInfo;
      });
  } catch {
    return [];
  }
}

export const austriaCountry: CountrySource = {
  region: "AT",
  displayName: "Austria",
  bounds: AUSTRIA_BOUNDS,
  sources: [
    {
      cacheKeyPrefix: "at/uas",
      settingKey: "austria",
      fetchForBounds: fetchAustriaFeaturesForBounds,
    },
  ],
  layerToggles: [{ key: "austria", label: "Austria (Austro Control)" }],
  getStyle: getAustriaStyle,
  queryPoint: queryAustriaZones,
  officialMap: { label: "dronespace.at", url: "https://utm.dronespace.at/avm/" },
  attribution: { label: "© Austro Control", url: "https://www.dronespace.at" },
};
