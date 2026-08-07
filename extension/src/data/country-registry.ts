import type {
  CountryRegion,
  ExtensionSettings,
  Region,
} from "../../types";
import type { CountrySource, CountrySubSource, ZoneStyle } from "./country-source";
import { austriaCountry } from "./austria";
import { czechCountry } from "./czech";
import { franceCountry } from "./france";
import { germanyCountry } from "./germany";
import { polandCountry } from "./poland";
import { isInsideBounds } from "./regions";
import { slovakiaCountry } from "./slovakia";
import { swissCountry } from "./switzerland";

/**
 * Adding a country = one data module exporting a `CountrySource` + an entry
 * here. The Record over `Region` makes a missing (or orphaned) entry a
 * compile error when the union in types/index.ts changes.
 */
export const COUNTRY_BY_REGION: Record<Region, CountrySource> = {
  CH: swissCountry,
  CZ: czechCountry,
  FR: franceCountry,
  DE: germanyCountry,
  AT: austriaCountry,
  PL: polandCountry,
  SK: slovakiaCountry,
};

/**
 * Ordered: `detectRegion` output order, the panel's toggle/link order and the
 * style cascade all follow this array.
 */
export const COUNTRY_SOURCES: readonly CountrySource[] = [
  swissCountry,
  czechCountry,
  franceCountry,
  germanyCountry,
  austriaCountry,
  polandCountry,
  slovakiaCountry,
];

export function detectRegion(lat: number, lng: number): CountryRegion {
  return COUNTRY_SOURCES.filter((c) => isInsideBounds(lat, lng, c.bounds)).map(
    (c) => c.region
  );
}

/** One country sub-source that is active for the current viewport + settings. */
export interface ActiveSource {
  country: CountrySource;
  sub: CountrySubSource;
}

/**
 * Country enabled by region, sub-source enabled by its layer toggle.
 * `!== false` deliberately treats missing keys as enabled — stored settings
 * may predate a country's existence.
 */
export function activeSourcesFor(
  region: CountryRegion,
  layers: ExtensionSettings["layers"],
  registry: readonly CountrySource[] = COUNTRY_SOURCES
): ActiveSource[] {
  const active: ActiveSource[] = [];
  for (const country of registry) {
    if (!region.includes(country.region)) continue;
    for (const sub of country.sources) {
      if (layers[sub.settingKey] !== false) active.push({ country, sub });
    }
  }
  return active;
}

/**
 * First country style that claims the feature (via `_dronmap_style_key`);
 * null means the caller should fall back to the generic restriction color.
 */
export function resolveFeatureStyle(
  props: Record<string, unknown> | null | undefined
): ZoneStyle | null {
  for (const country of COUNTRY_SOURCES) {
    const style = country.getStyle?.(props);
    if (style) return style;
  }
  return null;
}
