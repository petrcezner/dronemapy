import type { Feature, Geometry, Position } from "geojson";
import type { MapViewport } from "../../types";
import { createProjector, type ViewportProjector } from "../data/projection";
import { featureIntersectsBounds } from "../data/feature-bbox";
import { getCzechStyle } from "../data/czech";
import { getFranceStyle } from "../data/france";

const RESTRICTION_COLORS: Record<string, string> = {
  PROHIBITED: "rgba(220, 38, 38, 0.55)",
  REQ_AUTHORISATION: "rgba(234, 179, 8, 0.55)",
  CONDITIONAL: "rgba(249, 115, 22, 0.55)",
  default: "rgba(147, 51, 234, 0.45)",
};

// dense airport grids are thousands of small squares — canvas handles this
// easily; the cap is only a runaway backstop
const MAX_FEATURES = 5000;

const DEBUG_LANDMARKS = [
  { name: "Prague Castle", lng: 14.4003, lat: 50.09 },
  { name: "Zurich HB", lng: 8.5402, lat: 47.3779 },
  { name: "Brno center", lng: 16.6068, lat: 49.1951 },
];

function debugEnabled(): boolean {
  try {
    return localStorage.getItem("dronmap-debug") === "1";
  } catch {
    return false;
  }
}

export function getRestrictionColor(restriction?: string): string {
  if (!restriction) return RESTRICTION_COLORS.default;
  const upper = restriction.toUpperCase();
  for (const [key, color] of Object.entries(RESTRICTION_COLORS)) {
    if (upper.includes(key)) return color;
  }
  if (upper.includes("PROHIBIT") || upper.includes("NO")) {
    return RESTRICTION_COLORS.PROHIBITED;
  }
  if (upper.includes("AUTHOR") || upper.includes("PERMIT")) {
    return RESTRICTION_COLORS.REQ_AUTHORISATION;
  }
  return RESTRICTION_COLORS.default;
}

function flattenCoordinates(geometry: Geometry): Position[][] {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates;
    case "MultiPolygon":
      return geometry.coordinates.flat();
    default:
      return [];
  }
}

function readRestriction(props: Record<string, unknown>): string | undefined {
  const value =
    props.restriction ??
    props.zone_restriction_en ??
    props.restrictionConditions ??
    props.OMEZENI ??
    props.omezeni ??
    props.TYP;
  return value != null ? String(value) : undefined;
}

export class OverlayRenderer {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private zoomHint: HTMLDivElement;
  private opacity = 0.45;
  private resizeObserver: ResizeObserver | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private lastDrawnViewport: MapViewport | null = null;
  private hatchPatterns = new Map<string, CanvasPattern>();

  constructor(parent: HTMLElement, private mapEl: HTMLElement) {
    this.container = document.createElement("div");
    this.container.id = "dronmap-overlay-root";
    this.container.className = "dronmap-overlay-root";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "dronmap-overlay-canvas";
    this.ctx = this.canvas.getContext("2d")!;

    this.zoomHint = document.createElement("div");
    this.zoomHint.className = "dronmap-zoom-hint dronmap-hidden";
    this.zoomHint.textContent = "Zoom in for drone zones";

    this.container.appendChild(this.canvas);
    this.container.appendChild(this.zoomHint);
    parent.appendChild(this.container);

    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(parent);
    if (mapEl !== parent) this.resizeObserver.observe(mapEl);
    this.syncSize();
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
    this.container.style.setProperty("--dronmap-opacity", String(opacity));
  }

  /** Align the overlay root with the map element's rect and size the backing store at DPR. */
  syncSize(): void {
    const parent = this.container.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const mapRect = this.mapEl.isConnected
      ? this.mapEl.getBoundingClientRect()
      : parentRect;

    const w = Math.max(Math.round(mapRect.width), 1);
    const h = Math.max(Math.round(mapRect.height), 1);
    const dpr = window.devicePixelRatio || 1;

    this.container.style.left = `${Math.round(mapRect.left - parentRect.left)}px`;
    this.container.style.top = `${Math.round(mapRect.top - parentRect.top)}px`;
    this.container.style.width = `${w}px`;
    this.container.style.height = `${h}px`;

    if (w !== this.cssWidth || h !== this.cssHeight || dpr !== this.dpr) {
      this.cssWidth = w;
      this.cssHeight = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
  }

  clearVector(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawPolygons(features: Feature<Geometry>[], viewport: MapViewport): void {
    this.resetFollowTransform();
    this.clearVector();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.globalAlpha = this.opacity;

    const project = createProjector(viewport);
    const visible = features.filter((f) =>
      featureIntersectsBounds(f, viewport.bounds)
    );
    const toDraw =
      visible.length > MAX_FEATURES ? visible.slice(0, MAX_FEATURES) : visible;

    for (const feature of toDraw) {
      const props = feature.properties ?? {};
      const czechStyle = getCzechStyle(props);
      const franceStyle = czechStyle ? null : getFranceStyle(props);

      let stroke: string | null = null;
      if (czechStyle) {
        this.ctx.fillStyle = czechStyle.hatch
          ? this.getHatchPattern(czechStyle.fill)
          : czechStyle.fill;
        stroke = czechStyle.outline ?? null;
      } else if (franceStyle) {
        this.ctx.fillStyle = franceStyle.fill;
        stroke = franceStyle.outline ?? null;
      } else {
        this.ctx.fillStyle = getRestrictionColor(readRestriction(props));
      }

      const rings = flattenCoordinates(feature.geometry);
      for (const ring of rings) {
        this.drawRing(ring, project, stroke);
      }
    }

    this.ctx.globalAlpha = 1;
    if (debugEnabled()) this.drawDebugLayer(viewport, project);
    this.lastDrawnViewport = viewport;
  }

  private drawRing(
    ring: Position[],
    project: ViewportProjector,
    stroke: string | null = null
  ): void {
    if (ring.length === 0) return;
    this.ctx.beginPath();
    for (let i = 0; i < ring.length; i++) {
      const [lng, lat] = ring[i];
      const pixel = project.toPixel(lng, lat);
      if (i === 0) {
        this.ctx.moveTo(pixel.x, pixel.y);
      } else {
        this.ctx.lineTo(pixel.x, pixel.y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
    if (stroke) {
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }
  }

  /** Diagonal-hatch pattern used for military objects, matching the official map. */
  private getHatchPattern(color: string): CanvasPattern | string {
    const cached = this.hatchPatterns.get(color);
    if (cached) return cached;
    const tile = document.createElement("canvas");
    tile.width = 8;
    tile.height = 8;
    const tctx = tile.getContext("2d");
    if (!tctx) return color;
    tctx.strokeStyle = color;
    tctx.lineWidth = 1.5;
    tctx.beginPath();
    tctx.moveTo(-2, 10);
    tctx.lineTo(10, -2);
    tctx.moveTo(-2, 2);
    tctx.lineTo(2, -2);
    tctx.moveTo(6, 10);
    tctx.lineTo(10, 6);
    tctx.stroke();
    const pattern = this.ctx.createPattern(tile, "repeat");
    if (!pattern) return color;
    this.hatchPatterns.set(color, pattern);
    return pattern;
  }

  private drawDebugLayer(viewport: MapViewport, project: ViewportProjector): void {
    const ctx = this.ctx;
    const cx = viewport.width / 2;
    const cy = viewport.height / 2;

    ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    ctx.font = "11px system-ui, sans-serif";
    for (const lm of DEBUG_LANDMARKS) {
      const p = project.toPixel(lm.lng, lm.lat);
      ctx.fillStyle = "rgba(0, 200, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(lm.name, p.x + 6, p.y - 6);
    }

    const sw = project.toPixel(viewport.bounds.west, viewport.bounds.south);
    const ne = project.toPixel(viewport.bounds.east, viewport.bounds.north);
    ctx.strokeStyle = "rgba(0, 200, 255, 0.5)";
    ctx.strokeRect(sw.x, ne.y, ne.x - sw.x, sw.y - ne.y);
  }

  getLastDrawnViewport(): MapViewport | null {
    return this.lastDrawnViewport;
  }

  setFollowTransform(tx: number, ty: number, scale: number): void {
    this.canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  resetFollowTransform(): void {
    this.canvas.style.transform = "";
  }

  setUncertain(uncertain: boolean): void {
    this.container.classList.toggle("dronmap-uncertain", uncertain);
  }

  setFollowHidden(hidden: boolean): void {
    this.container.classList.toggle("dronmap-follow-hidden", hidden);
  }

  setZoomHint(visible: boolean): void {
    this.zoomHint.classList.toggle("dronmap-hidden", !visible);
  }

  setVisible(visible: boolean): void {
    this.container.classList.toggle("dronmap-hidden", !visible);
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.container.remove();
  }

  getContainer(): HTMLElement {
    return this.container;
  }
}
