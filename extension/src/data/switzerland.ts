import type { Feature, Geometry } from "geojson";
import type { MapViewport, SwissFeatureCollection, ZoneInfo } from "../../types";

const CH_GEOJSON_URL =
  "https://data.geo.admin.ch/ch.bazl.einschraenkungen-drohnen/einschraenkungen-drohnen/einschraenkungen-drohnen_4326.geojson";
const CH_STAC_URL =
  "https://data.geo.admin.ch/api/stac/v1/collections/ch.bazl.einschraenkungen-drohnen/items/einschraenkungen-drohnen";
const CH_IDENTIFY_URL =
  "https://api3.geo.admin.ch/rest/services/ech/MapServer/identify";

export { CH_GEOJSON_URL, CH_STAC_URL };

/**
 * geo.admin.ch's MapServer has no ESRI `/query` operation (it 404s);
 * the `identify` endpoint with an envelope + geometryFormat=geojson is the
 * supported way to get zone polygons (WGS84 GeoJSON Features in `results`).
 */
export async function fetchSwissFeaturesForBounds(
  bounds: MapViewport["bounds"]
): Promise<Feature<Geometry>[]> {
  const envelope = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const params = new URLSearchParams({
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    layers: "all:ch.bazl.einschraenkungen-drohnen",
    mapExtent: envelope,
    imageDisplay: "1000,1000,96",
    tolerance: "0",
    returnGeometry: "true",
    geometryFormat: "geojson",
    sr: "4326",
    limit: "200",
  });

  const res = await fetch(`${CH_IDENTIFY_URL}?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  return (data?.results ?? []).filter(
    (f: Feature<Geometry>) => f?.geometry != null
  );
}

export async function fetchSwissStacUpdated(): Promise<string | null> {
  try {
    const res = await fetch(CH_STAC_URL);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.properties?.updated ?? null;
  } catch {
    return null;
  }
}

export async function downloadSwissGeoJson(
  onProgress?: (pct: number) => void
): Promise<SwissFeatureCollection> {
  const res = await fetch(CH_GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to download Swiss data: ${res.status}`);

  const reader = res.body?.getReader();
  if (!reader) {
    const data = (await res.json()) as SwissFeatureCollection;
    return data;
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (contentLength > 0 && onProgress) {
        onProgress(Math.round((received / contentLength) * 100));
      }
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(merged);
  return JSON.parse(text) as SwissFeatureCollection;
}

export async function identifySwissZone(
  lng: number,
  lat: number
): Promise<ZoneInfo[]> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    layers: "all:ch.bazl.einschraenkungen-drohnen",
    sr: "4326",
    tolerance: "0",
    returnGeometry: "false",
    geometryFormat: "geojson",
    lang: "en",
  });

  const res = await fetch(`${CH_IDENTIFY_URL}?${params}`);
  if (!res.ok) return [];

  const data = await res.json();
  const results = data?.results ?? [];

  return results
    .filter(
      (r: { attributes?: Record<string, unknown>; properties?: Record<string, unknown> }) =>
        Boolean(r.attributes ?? r.properties)
    )
    .map((r: { attributes?: Record<string, unknown>; properties?: Record<string, unknown> }) => {
      const attrs = r.attributes ?? r.properties ?? {};
      return {
        name: String(attrs.zone_name_en ?? attrs.name ?? "Swiss UAS zone"),
        restriction: String(
          attrs.zone_restriction_en ?? attrs.restriction ?? "See official map"
        ),
        altitude: formatAltitude(attrs),
        authority: attrs.auth_name_en ? String(attrs.auth_name_en) : undefined,
        email: attrs.auth_email ? String(attrs.auth_email) : undefined,
        source: "BAZL / geo.admin.ch",
        raw: attrs,
      } satisfies ZoneInfo;
    });
}

function formatAltitude(attrs: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  if (attrs.max_altitude) parts.push(`Max: ${attrs.max_altitude}`);
  if (attrs.lower_limit) parts.push(`Lower: ${attrs.lower_limit}`);
  if (attrs.upper_limit) parts.push(`Upper: ${attrs.upper_limit}`);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function extractSwissFeatures(
  collection: SwissFeatureCollection
): Feature<Geometry>[] {
  return collection.features ?? [];
}
