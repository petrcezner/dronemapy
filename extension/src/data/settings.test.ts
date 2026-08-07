import { describe, it, expect } from "vitest";
import type { ExtensionSettings } from "../../types";
import { DEFAULT_SETTINGS, mergeStoredSettings } from "../../types";

describe("mergeStoredSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(mergeStoredSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps stored top-level values", () => {
    const merged = mergeStoredSettings({ enabled: false, opacity: 0.7 });
    expect(merged.enabled).toBe(false);
    expect(merged.opacity).toBe(0.7);
  });

  it("defaults layer keys the stored settings predate", () => {
    // a user who stored settings before DE/AT/PL/SK existed
    const legacy = {
      layers: {
        switzerland: true,
        czechHop: false,
        czechGrids: true,
        czechProtected: true,
        czechMilitary: true,
        france: false,
      } as Partial<ExtensionSettings["layers"]>,
    };
    const merged = mergeStoredSettings(legacy as Partial<ExtensionSettings>);
    expect(merged.layers.czechHop).toBe(false); // stored choice kept
    expect(merged.layers.france).toBe(false);
    expect(merged.layers.germanyAirspace).toBe(true); // new key defaulted
    expect(merged.layers.austria).toBe(true);
    expect(merged.layers.poland).toBe(true);
    expect(merged.layers.slovakia).toBe(true);
  });
});
