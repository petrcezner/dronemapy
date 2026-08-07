import { describe, it, expect } from "vitest";
import { getFranceStyle, describeRestriction } from "./france";

describe("getFranceStyle", () => {
  it("returns null for non-France features", () => {
    expect(getFranceStyle({ zone_restriction_en: "Prohibited" })).toBeNull();
    expect(getFranceStyle(null)).toBeNull();
    expect(getFranceStyle({ _dronmap_style_key: "unknown" })).toBeNull();
  });

  it("marks hard prohibitions in red", () => {
    const style = getFranceStyle({
      _dronmap_style_key: "france",
      limite: "Vol interdit *",
    });
    expect(style?.fill).toBe("rgba(220, 38, 38, 0.55)");
  });

  it("marks conditional restrictions in amber", () => {
    const style = getFranceStyle({
      _dronmap_style_key: "france",
      limite: "Notification préalable obligatoire",
    });
    expect(style?.fill).toBe("rgba(234, 179, 8, 0.55)");
  });
});

describe("describeRestriction", () => {
  it("translates known DGAC phrasings to English", () => {
    expect(describeRestriction({ limite: "Vol interdit *" })).toBe(
      "Flight prohibited"
    );
    expect(
      describeRestriction({ limite: "Hauteur maximale de vol de 100 m *" })
    ).toBe("Max flight height: 100 m");
    expect(
      describeRestriction({
        remarque:
          "Altitude de référence de l'aérodrome : 1860 m",
      })
    ).toBe("Aerodrome reference altitude: 1860 m");
    expect(
      describeRestriction({
        remarque:
          "Notification préalable obligatoire pour les aéronefs de masse supérieure à 900g.",
      })
    ).toBe("Prior notification required for aircraft over 900 g.");
  });

  it("combines limite and remarque when both are present", () => {
    expect(
      describeRestriction({
        limite: "Vol interdit *",
        remarque:
          "Évolution interdite en espace public en agglomération sauf conformément à l'arrêté Espace.",
      })
    ).toBe(
      "Flight prohibited — Flight over public areas in built-up zones is prohibited, except as permitted under the Espace decree."
    );
  });

  it("falls back to the raw French text for unrecognized phrasings", () => {
    expect(describeRestriction({ limite: "Some new DGAC phrasing" })).toBe(
      "Some new DGAC phrasing"
    );
  });

  it("falls back to a generic message when nothing is present", () => {
    expect(describeRestriction({})).toBe("Restricted – verify on Géoportail");
  });
});
