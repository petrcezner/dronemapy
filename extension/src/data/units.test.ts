import { describe, it, expect } from "vitest";
import { convertAltitudeText, feetToMeters, metersToFeet } from "./units";

describe("metersToFeet / feetToMeters", () => {
  it("converts and rounds", () => {
    expect(metersToFeet(100)).toBe(328);
    expect(metersToFeet(120)).toBe(394);
    expect(feetToMeters(8000)).toBe(2438);
    expect(feetToMeters(0)).toBe(0);
  });
});

describe("convertAltitudeText", () => {
  it("converts metre mentions to feet in imperial mode", () => {
    expect(convertAltitudeText("Max 100 m AGL", "imperial")).toBe(
      "Max 328 ft AGL"
    );
    expect(convertAltitudeText("0 m – 120 m", "imperial")).toBe(
      "0 ft – 394 ft"
    );
    expect(convertAltitudeText("Max flight height: 100 m", "imperial")).toBe(
      "Max flight height: 328 ft"
    );
    // SK NSAT style without space, and "+" suffix from the legend
    expect(convertAltitudeText("GND - 120m AGL", "imperial")).toBe(
      "GND - 394 ft AGL"
    );
    expect(convertAltitudeText("120+ m", "imperial")).toBe("394+ ft");
  });

  it("converts feet mentions to metres in metric mode", () => {
    expect(convertAltitudeText("0 FT – 8000 FT", "metric")).toBe(
      "0 m – 2438 m"
    );
    expect(convertAltitudeText("550 ft AMSL", "metric")).toBe("168 m AMSL");
  });

  it("leaves the already-correct system untouched", () => {
    expect(convertAltitudeText("Max 100 m AGL", "metric")).toBe(
      "Max 100 m AGL"
    );
    expect(convertAltitudeText("0 FT – 8000 FT", "imperial")).toBe(
      "0 FT – 8000 FT"
    );
  });

  it("passes flight levels and named levels through in both modes", () => {
    for (const units of ["metric", "imperial"] as const) {
      expect(convertAltitudeText("FL95", units)).toBe("FL95");
      expect(convertAltitudeText("GND – UNL", units)).toBe("GND – UNL");
      expect(convertAltitudeText("SFC - FL660", units)).toBe("SFC - FL660");
    }
  });

  it("does not touch 'm' inside words or unrelated numbers", () => {
    expect(convertAltitudeText("Prior notification over 900 g.", "imperial")).toBe(
      "Prior notification over 900 g."
    );
    expect(convertAltitudeText("100 mm rain", "imperial")).toBe("100 mm rain");
    expect(convertAltitudeText("Flight prohibited", "imperial")).toBe(
      "Flight prohibited"
    );
  });

  it("handles decimal values with dot or comma", () => {
    expect(convertAltitudeText("Max 1.5 m", "imperial")).toBe("Max 5 ft");
    expect(convertAltitudeText("Max 1,5 m", "imperial")).toBe("Max 5 ft");
  });
});
