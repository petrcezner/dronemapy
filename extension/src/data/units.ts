import type { Units } from "../../types";

const FEET_PER_METER = 3.28084;

export function metersToFeet(m: number): number {
  return Math.round(m * FEET_PER_METER);
}

export function feetToMeters(ft: number): number {
  return Math.round(ft / FEET_PER_METER);
}

// "100 m", "120+ m", "120m" — a number (with optional +) followed by a bare
// "m" that isn't part of a longer word (AMSL, min, …)
const METERS_RE = /(\d+(?:[.,]\d+)?)(\+?)\s*m\b(?![a-zA-Z])/g;
// "8000 FT", "550 ft" — flight levels ("FL95") deliberately don't match
const FEET_RE = /(\d+(?:[.,]\d+)?)(\+?)\s*(?:ft|FT)\b(?![a-zA-Z])/g;

function parseNum(s: string): number {
  return parseFloat(s.replace(",", "."));
}

/**
 * Convert every altitude mention inside a display string to the selected
 * unit system. Metric: feet values become metres; imperial: metre values
 * become feet. `FL95`, `GND`, `UNL`, `SFC` etc. pass through unchanged —
 * flight levels are unit-less and named levels have no numeric value.
 *
 * Zone data mixes systems at the source (CZ/DE/FR/AT metres, SK/PL feet),
 * so this runs at display time over the already-composed strings.
 */
export function convertAltitudeText(text: string, units: Units): string {
  if (units === "imperial") {
    return text.replace(
      METERS_RE,
      (_, num: string, plus: string) => `${metersToFeet(parseNum(num))}${plus} ft`
    );
  }
  return text.replace(
    FEET_RE,
    (_, num: string, plus: string) => `${feetToMeters(parseNum(num))}${plus} m`
  );
}
