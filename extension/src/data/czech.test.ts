import { describe, it, expect } from "vitest";
import { getCzechStyle } from "./czech";

describe("getCzechStyle", () => {
  it("returns null for non-Czech features", () => {
    expect(getCzechStyle({ zone_restriction_en: "Prohibited" })).toBeNull();
    expect(getCzechStyle(null)).toBeNull();
    expect(getCzechStyle({ _dronmap_style_key: "unknown/9" })).toBeNull();
  });

  it("uses official HOP colors", () => {
    const a3 = getCzechStyle({ _dronmap_style_key: "HOPs/1" });
    expect(a3).toEqual({ fill: "rgb(205,183,118)", outline: "rgb(209,66,0)" });
    const a1a2 = getCzechStyle({ _dronmap_style_key: "HOPs/2" });
    expect(a1a2?.fill).toBe("rgb(246,218,140)");
  });

  it("maps grid AGL_limit through the official ramp", () => {
    const red = getCzechStyle({ _dronmap_style_key: "Gridy/0", AGL_limit: 10 });
    expect(red?.fill).toBe("rgb(212,0,0)");
    const mid = getCzechStyle({ _dronmap_style_key: "Gridy/1", AGL_limit: 65 });
    expect(mid?.fill).toBe("rgb(237,201,57)");
    const green = getCzechStyle({ _dronmap_style_key: "Gridy/0", AGL_limit: 120 });
    expect(green?.fill).toBe("rgb(117,179,111)");
  });

  it("falls back to the most restrictive grid color when AGL_limit is missing", () => {
    const style = getCzechStyle({ _dronmap_style_key: "Gridy/0" });
    expect(style?.fill).toBe("rgb(212,0,0)");
  });

  it("marks military objects as hatched", () => {
    const mil = getCzechStyle({ _dronmap_style_key: "ODOS/0" });
    expect(mil?.hatch).toBe(true);
  });
});
