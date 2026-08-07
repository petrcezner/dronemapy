import type { Feature, FeatureCollection, Geometry } from "geojson";

export type Region = "CH" | "CZ" | "FR" | "DE" | "AT" | "PL" | "SK";
/** Every region whose bounding box contains the point — boxes can overlap (e.g. CH/FR border). */
export type CountryRegion = Region[];

export interface MapViewport {
  center: { lat: number; lng: number };
  zoom: number;
  width: number;
  height: number;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export type Units = "metric" | "imperial";

export interface ExtensionSettings {
  enabled: boolean;
  opacity: number;
  panelVisible: boolean;
  panelExpanded: boolean;
  /** Show the zone-info pop-up when the map is clicked. */
  clickPopups: boolean;
  /** Unit system for all displayed altitudes (popups, legend). */
  units: Units;
  layers: {
    switzerland: boolean;
    czechHop: boolean;
    czechGrids: boolean;
    czechProtected: boolean;
    czechMilitary: boolean;
    france: boolean;
    germanyAirspace: boolean;
    germanyMilitary: boolean;
    germanyNature: boolean;
    austria: boolean;
    poland: boolean;
    slovakia: boolean;
  };
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  opacity: 0.45,
  panelVisible: true,
  panelExpanded: false,
  clickPopups: true,
  units: "metric",
  layers: {
    switzerland: true,
    czechHop: true,
    czechGrids: true,
    czechProtected: true,
    czechMilitary: true,
    france: true,
    germanyAirspace: true,
    germanyMilitary: true,
    germanyNature: true,
    austria: true,
    poland: true,
    slovakia: true,
  },
};

/**
 * Merge settings loaded from storage over the defaults. Must be used instead
 * of a plain spread: stored settings predate newly added countries, and a
 * shallow merge would let the old `layers` object shadow every new key with
 * `undefined`, silently disabling new countries for existing users.
 */
export function mergeStoredSettings(
  stored: Partial<ExtensionSettings> | null | undefined
): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    layers: { ...DEFAULT_SETTINGS.layers, ...stored?.layers },
  };
}

export interface ZoneInfo {
  name: string;
  restriction: string;
  altitude?: string;
  authority?: string;
  email?: string;
  source: string;
  raw?: Record<string, unknown>;
}

export interface SwissFeatureProperties {
  identifier?: string;
  name?: string;
  restriction?: string;
  restrictionConditions?: string;
  reason?: string;
  message?: string;
  zone_name_en?: string;
  zone_restriction_en?: string;
  auth_name_en?: string;
  auth_email?: string;
  [key: string]: unknown;
}

export type SwissFeatureCollection = FeatureCollection<
  Geometry,
  SwissFeatureProperties
>;

export type MessageType =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: Partial<ExtensionSettings> }
  | { type: "GET_SWISS_TILES"; tileIds: string[] }
  | { type: "FETCH_POLAND_AIRSPACE"; feed: "static" | "aup" }
  | { type: "SWISS_DATA_STATUS" }
  | { type: "DOWNLOAD_SWISS_DATA" }
  | { type: "SETTINGS_UPDATED"; settings: ExtensionSettings }
  | { type: "TOGGLE_PANEL" }
  | {
      type: "SWISS_DOWNLOAD_PROGRESS";
      progress: number;
      status: "downloading" | "indexing" | "done" | "error";
      error?: string;
    };
