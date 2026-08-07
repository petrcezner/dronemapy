import { describe, it, expect } from "vitest";
import { masterState } from "./map-panel";
import { DEFAULT_SETTINGS } from "../../types";

describe("masterState", () => {
  const keys = ["czechHop", "czechGrids", "czechProtected", "czechMilitary"] as const;

  it("is on when every sub-layer is enabled", () => {
    expect(masterState(DEFAULT_SETTINGS.layers, [...keys])).toBe("on");
  });

  it("is off when every sub-layer is disabled", () => {
    const layers = {
      ...DEFAULT_SETTINGS.layers,
      czechHop: false,
      czechGrids: false,
      czechProtected: false,
      czechMilitary: false,
    };
    expect(masterState(layers, [...keys])).toBe("off");
  });

  it("is mixed when only some sub-layers are enabled", () => {
    const layers = { ...DEFAULT_SETTINGS.layers, czechGrids: false };
    expect(masterState(layers, [...keys])).toBe("mixed");
  });

  it("counts a missing key as enabled (settings predating the layer)", () => {
    const layers = { ...DEFAULT_SETTINGS.layers } as Record<string, boolean>;
    delete layers.czechGrids;
    expect(
      masterState(layers as typeof DEFAULT_SETTINGS.layers, [...keys])
    ).toBe("on");
  });
});
