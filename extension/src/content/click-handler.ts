import type { MapViewport, ZoneInfo } from "../../types";
import { identifySwissZone } from "../data/switzerland";
import { queryCzechZones } from "../data/czech";
import { queryFranceZones } from "../data/france";
import { detectRegion } from "../data/regions";
import { pixelToLngLat } from "../data/projection";

const CLICK_MAX_MOVE_PX = 6;

export class ClickHandler {
  private panel: HTMLDivElement;
  private mapTarget: HTMLElement | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private isEnabled: () => boolean = () => true;
  private getViewport: () => MapViewport | null = () => null;
  private onPointerDown: ((e: PointerEvent) => void) | null = null;
  private onPointerUp: ((e: PointerEvent) => void) | null = null;

  constructor(container: HTMLElement) {
    this.panel = document.createElement("div");
    this.panel.className = "dronmap-info-panel dronmap-hidden";
    this.panel.innerHTML = `
      <button class="dronmap-close" aria-label="Close">&times;</button>
      <div class="dronmap-info-content"></div>
      <div class="dronmap-info-footer">
        <small>Informational only. Verify on official maps before flying.</small>
      </div>
    `;
    container.appendChild(this.panel);

    this.panel.querySelector(".dronmap-close")?.addEventListener("click", () => {
      this.hide();
    });
  }

  attach(
    mapTarget: HTMLElement,
    getViewport: () => MapViewport | null,
    isEnabled: () => boolean
  ): void {
    this.detach();
    this.mapTarget = mapTarget;
    this.getViewport = getViewport;
    this.isEnabled = isEnabled;

    const onPointerDown = (e: PointerEvent) => {
      if (!this.isEnabled()) return;
      this.pointerDown = { x: e.clientX, y: e.clientY };
    };
    this.onPointerDown = onPointerDown;

    this.onPointerUp = async (e: PointerEvent) => {
      if (!this.isEnabled() || !this.pointerDown || !this.mapTarget) return;

      const dx = e.clientX - this.pointerDown.x;
      const dy = e.clientY - this.pointerDown.y;
      this.pointerDown = null;

      if (Math.hypot(dx, dy) > CLICK_MAX_MOVE_PX) return;
      if (e.button !== 0) return;

      const viewport = this.getViewport();
      if (!viewport) return;

      const rect = this.mapTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      const { lng, lat } = pixelToLngLat(x, y, viewport);

      this.showLoading(e.clientX, e.clientY);
      try {
        const zones = await this.fetchZones(lng, lat);
        this.showZones(zones, e.clientX, e.clientY);
      } catch {
        this.showError(e.clientX, e.clientY);
      }
    };

    mapTarget.addEventListener("pointerdown", onPointerDown, { passive: true });
    mapTarget.addEventListener("pointerup", this.onPointerUp, { passive: true });
  }

  setEnabled(isEnabled: () => boolean): void {
    this.isEnabled = isEnabled;
  }

  detach(): void {
    if (!this.mapTarget) return;
    if (this.onPointerDown) {
      this.mapTarget.removeEventListener("pointerdown", this.onPointerDown);
    }
    if (this.onPointerUp) {
      this.mapTarget.removeEventListener("pointerup", this.onPointerUp);
    }
    this.mapTarget = null;
    this.onPointerDown = null;
    this.onPointerUp = null;
    this.pointerDown = null;
  }

  private async fetchZones(lng: number, lat: number): Promise<ZoneInfo[]> {
    const region = detectRegion(lat, lng);
    const promises: Promise<ZoneInfo[]>[] = [];

    if (region.includes("CH")) {
      promises.push(identifySwissZone(lng, lat));
    }
    if (region.includes("CZ")) {
      promises.push(queryCzechZones(lng, lat));
    }
    if (region.includes("FR")) {
      promises.push(queryFranceZones(lng, lat));
    }

    const results = await Promise.all(promises);
    const merged = results.flat();

    if (merged.length === 0) {
      return [
        {
          name: "No restriction zone detected",
          restriction:
            region.length === 0
              ? "Move map to Switzerland, Czech Republic, or France"
              : "No zone at this point – always verify on official maps",
          source: "DronMap extension",
        },
      ];
    }

    return merged;
  }

  private showLoading(clientX: number, clientY: number): void {
    this.positionPanel(clientX, clientY);
    const content = this.panel.querySelector(".dronmap-info-content");
    if (content) content.innerHTML = "<p>Loading zone info…</p>";
    this.panel.classList.remove("dronmap-hidden");
  }

  private showError(clientX: number, clientY: number): void {
    this.positionPanel(clientX, clientY);
    const content = this.panel.querySelector(".dronmap-info-content");
    if (content) {
      content.innerHTML =
        "<p>Could not load zone info. Try again or check the official map.</p>";
    }
    this.panel.classList.remove("dronmap-hidden");
  }

  private showZones(zones: ZoneInfo[], clientX: number, clientY: number): void {
    this.positionPanel(clientX, clientY);
    const content = this.panel.querySelector(".dronmap-info-content");
    if (!content) return;

    content.innerHTML = zones
      .map(
        (z) => `
        <div class="dronmap-zone">
          <h3>${escapeHtml(z.name)}</h3>
          <p><strong>Restriction:</strong> ${escapeHtml(z.restriction)}</p>
          ${z.altitude ? `<p><strong>Altitude:</strong> ${escapeHtml(z.altitude)}</p>` : ""}
          ${z.authority ? `<p><strong>Authority:</strong> ${escapeHtml(z.authority)}</p>` : ""}
          ${z.email ? `<p><strong>Contact:</strong> <a href="mailto:${escapeHtml(z.email)}">${escapeHtml(z.email)}</a></p>` : ""}
          <p class="dronmap-source"><em>Source: ${escapeHtml(z.source)}</em></p>
        </div>
      `
      )
      .join("");

    this.panel.classList.remove("dronmap-hidden");
  }

  private positionPanel(clientX: number, clientY: number): void {
    const offset = 12;
    const maxLeft = window.innerWidth - 320;
    const maxTop = window.innerHeight - 200;
    this.panel.style.left = `${Math.min(clientX + offset, maxLeft)}px`;
    this.panel.style.top = `${Math.min(clientY + offset, maxTop)}px`;
  }

  hide(): void {
    this.panel.classList.add("dronmap-hidden");
  }

  destroy(): void {
    this.detach();
    this.panel.remove();
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
