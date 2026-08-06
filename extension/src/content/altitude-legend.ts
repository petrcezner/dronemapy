import { GRID_RAMP } from "../data/czech";

/** Corner legend decoding the Czech airport-grid color ramp into max AGL altitudes. */
export class AltitudeLegend {
  private root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "dronmap-legend dronmap-hidden";
    this.root.innerHTML = `
      <div class="dronmap-legend-title">Max flight height (AGL)</div>
      <div class="dronmap-legend-bar">${this.buildStops()}</div>
      <div class="dronmap-legend-ticks">
        <span>${GRID_RAMP[0][0]} m</span>
        <span>${GRID_RAMP[GRID_RAMP.length - 1][0]}+ m</span>
      </div>
    `;
    parent.appendChild(this.root);
  }

  private buildStops(): string {
    const max = GRID_RAMP[GRID_RAMP.length - 1][0];
    return GRID_RAMP.map(([limit, color], i) => {
      const prevLimit = i === 0 ? 0 : GRID_RAMP[i - 1][0];
      const width = ((limit - prevLimit) / max) * 100;
      return `<span style="width:${width}%;background:${color}" title="up to ${limit} m"></span>`;
    }).join("");
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle("dronmap-hidden", !visible);
  }

  destroy(): void {
    this.root.remove();
  }
}
