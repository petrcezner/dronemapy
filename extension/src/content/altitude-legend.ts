import type { Units } from "../../types";
import { GRID_RAMP } from "../data/czech";
import { metersToFeet } from "../data/units";

/** Corner legend decoding the Czech airport-grid color ramp into max AGL altitudes. */
export class AltitudeLegend {
  private root: HTMLDivElement;
  private units: Units;

  constructor(parent: HTMLElement, units: Units = "metric") {
    this.units = units;
    this.root = document.createElement("div");
    this.root.className = "dronmap-legend dronmap-hidden";
    parent.appendChild(this.root);
    this.render();
  }

  setUnits(units: Units): void {
    if (units === this.units) return;
    this.units = units;
    this.render();
  }

  private formatLimit(meters: number, plus = false): string {
    const suffix = plus ? "+" : "";
    return this.units === "imperial"
      ? `${metersToFeet(meters)}${suffix} ft`
      : `${meters}${suffix} m`;
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="dronmap-legend-title">Max flight height (AGL)</div>
      <div class="dronmap-legend-bar">${this.buildStops()}</div>
      <div class="dronmap-legend-ticks">
        <span>${this.formatLimit(GRID_RAMP[0][0])}</span>
        <span>${this.formatLimit(GRID_RAMP[GRID_RAMP.length - 1][0], true)}</span>
      </div>
    `;
  }

  private buildStops(): string {
    const max = GRID_RAMP[GRID_RAMP.length - 1][0];
    return GRID_RAMP.map(([limit, color], i) => {
      const prevLimit = i === 0 ? 0 : GRID_RAMP[i - 1][0];
      const width = ((limit - prevLimit) / max) * 100;
      return `<span style="width:${width}%;background:${color}" title="up to ${this.formatLimit(limit)}"></span>`;
    }).join("");
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("dronmap-hidden", !visible);
  }

  destroy(): void {
    this.root.remove();
  }
}
