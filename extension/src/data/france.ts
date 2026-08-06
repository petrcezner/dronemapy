import type { Feature, Geometry } from "geojson";
import type { MapViewport, ZoneInfo } from "../../types";

// IGN Géoplateforme WFS — "Restrictions UAS catégorie ouverte et aéromodélisme".
// Unlike Switzerland/Czech Republic there's a single national layer, no per-topic
// sub-services, so no source list/settingKey plumbing is needed here.
const FRANCE_WFS_BASE = "https://data.geopf.fr/wfs/ows";
const FRANCE_TYPENAME =
  "TRANSPORTS.DRONES.RESTRICTIONS:carte_restriction_drones_lf";

export interface FranceZoneStyle {
  fill: string;
  outline?: string;
}

const FRANCE_PROHIBITED_STYLE: FranceZoneStyle = {
  fill: "rgba(220, 38, 38, 0.55)",
  outline: "rgb(180,0,0)",
};
const FRANCE_RESTRICTED_STYLE: FranceZoneStyle = {
  fill: "rgba(234, 179, 8, 0.55)",
  outline: "rgb(180,140,0)",
};

/** Resolve the style for a France feature; null for non-France features. */
export function getFranceStyle(
  props: Record<string, unknown> | null | undefined
): FranceZoneStyle | null {
  if (props?._dronmap_style_key !== "france") return null;
  const limite = String(props?.limite ?? "");
  return /interdit/i.test(limite)
    ? FRANCE_PROHIBITED_STYLE
    : FRANCE_RESTRICTED_STYLE;
}

function buildFranceBboxUrl(bounds: MapViewport["bounds"]): string {
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: FRANCE_TYPENAME,
    OUTPUTFORMAT: "application/json",
    SRSNAME: "EPSG:4326",
    BBOX: `${bounds.west},${bounds.south},${bounds.east},${bounds.north},EPSG:4326`,
    COUNT: "2000",
  });
  return `${FRANCE_WFS_BASE}?${params}`;
}

// The WFS `limite`/`remarque` fields are French free text with a small set of
// recurring official (DGAC) phrasings — translate the ones we've observed and
// fall back to the raw French text (rather than dropping it) for anything else,
// since this is a nationwide dataset and not every phrasing has been seen.
const TRANSLATION_RULES: [RegExp, string][] = [
  [/^Vol interdit\s*\*?$/i, "Flight prohibited"],
  [/^Hauteur maximale de vol de\s*(\d+)\s*m\s*\*?$/i, "Max flight height: $1 m"],
  [
    /^Évolution interdite en espace public en agglomération sauf conformément à l'arrêté Espace\.?$/i,
    "Flight over public areas in built-up zones is prohibited, except as permitted under the Espace decree.",
  ],
  [
    /^Notification préalable obligatoire pour les aéronefs de masse supérieure à\s*(\d+)\s*g\.?$/i,
    "Prior notification required for aircraft over $1 g.",
  ],
  [
    /^Altitude de référence de l'aérodrome\s*:\s*(\d+)\s*m$/i,
    "Aerodrome reference altitude: $1 m",
  ],
  [
    /^Altitude de référence de l'hélistation\s*:\s*(\d+)\s*m$/i,
    "Helipad reference altitude: $1 m",
  ],
];

function translateFrenchZoneText(text: string): string {
  const trimmed = text.trim();
  for (const [pattern, replacement] of TRANSLATION_RULES) {
    if (pattern.test(trimmed)) return trimmed.replace(pattern, replacement);
  }
  return trimmed; // untranslated phrasing — keep the original rather than drop it
}

export function describeRestriction(props: Record<string, unknown>): string {
  const parts = [props.limite, props.remarque]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(translateFrenchZoneText);
  return parts.join(" — ") || "Restricted – verify on Géoportail";
}

export async function fetchFranceFeaturesForBounds(
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const res = await fetch(buildFranceBboxUrl(bounds));
  if (!res.ok) return [];
  const data = await res.json();
  const features: Feature<Geometry>[] = data?.features ?? [];
  return features.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      _dronmap_source: "DGAC / Géoportail",
      _dronmap_layer: "france",
      _dronmap_style_key: "france",
      restriction: describeRestriction(f.properties ?? {}),
    },
  }));
}

// The WFS has no bare point-intersect query param, so a small bbox around the
// click point stands in for it — same precision tradeoff the overlay already
// makes when rendering polygons at this zoom level.
const POINT_QUERY_PAD_DEG = 0.0015;

export async function queryFranceZones(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const bounds = {
    west: lng - POINT_QUERY_PAD_DEG,
    south: lat - POINT_QUERY_PAD_DEG,
    east: lng + POINT_QUERY_PAD_DEG,
    north: lat + POINT_QUERY_PAD_DEG,
  };
  try {
    const res = await fetch(buildFranceBboxUrl(bounds));
    if (!res.ok) return [];
    const data = await res.json();
    const features: Feature<Geometry>[] = data?.features ?? [];
    return features.map((f) => {
      const props = f.properties ?? {};
      return {
        name: "UAS restriction zone",
        restriction: describeRestriction(props),
        authority: "DGAC",
        source: "DGAC / Géoportail",
        raw: props,
      };
    });
  } catch {
    return [];
  }
}
