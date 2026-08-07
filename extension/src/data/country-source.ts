import type { Feature, Geometry } from "geojson";
import type { ExtensionSettings, MapViewport, Region, ZoneInfo } from "../../types";
import type { RegionBounds } from "./regions";

export type LayerKey = keyof ExtensionSettings["layers"];

/** Unified polygon style; superset of the per-country style shapes. */
export interface ZoneStyle {
  fill: string;
  outline?: string;
  /** Draw a diagonal hatch instead of a solid fill (military objects). */
  hatch?: boolean;
}

/** One independently cached, independently toggled data stream of a country. */
export interface CountrySubSource {
  /**
   * Persistent-cache prefix; the full IndexedDB key is `${prefix}/${tileId}`.
   * NEVER change a prefix once shipped — users' cached tiles are keyed on it.
   */
  cacheKeyPrefix: string;
  /** Layer toggle controlling this stream (several streams may share one key). */
  settingKey: LayerKey;
  /**
   * Set false to skip the week-long persistent tile cache (data that changes
   * daily, e.g. Poland's AUP reservations). The in-memory session cache still
   * applies.
   */
  persist?: boolean;
  /**
   * Fetch the features intersecting `bounds` (one grid tile). Whole-country
   * sources (Austria, Poland) implement this with a module-level memoized
   * download clipped per tile; a thrown error marks the tile for retry.
   */
  fetchForBounds(bounds: MapViewport["bounds"]): Promise<Feature<Geometry>[]>;
}

export interface CountrySource {
  region: Region;
  displayName: string;
  bounds: RegionBounds;
  sources: CountrySubSource[];
  /** UI checkboxes; one per settingKey, NOT one per sub-source. */
  layerToggles: { key: LayerKey; label: string }[];
  /**
   * Style for this country's features, keyed off `_dronmap_style_key`;
   * null for other countries' features. Omit to use the generic
   * restriction-color fallback (Switzerland does).
   */
  getStyle?(props: Record<string, unknown> | null | undefined): ZoneStyle | null;
  /** Point query for the click popup; ignores layer toggles by design. */
  queryPoint(lng: number, lat: number): Promise<ZoneInfo[]>;
  officialMap: { label: string; url: string };
  attribution: { label: string; url: string };
  /**
   * Optional bulk local-tile hook checked before the persistent cache and the
   * network (Switzerland's offline IndexedDB download). Called once per fetch
   * batch with all missing tile ids.
   */
  getLocalTiles?(tileIds: string[]): Promise<Record<string, Feature<Geometry>[]>>;
}
