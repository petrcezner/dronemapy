import type { MapViewport } from "../../types";
import { viewportFromCenterZoom } from "../data/projection";
import { viewportFingerprint } from "../data/viewport-fingerprint";
import {
  calibrate,
  collectTileSamples,
  viewportFromCalibration,
} from "./tile-probe";

type ViewportListener = (viewport: MapViewport) => void;

const SETTLE_MS = 350;
/** After a gesture ends, poll the URL briefly to track inertial pan/zoom animation. */
const INERTIA_POLL_MS = 100;
const INERTIA_WATCH_MS = 1500;

interface ParsedMapyUrl {
  lat: number;
  lng: number;
  zoom: number;
}

function parseMapyUrl(url: string): ParsedMapyUrl | null {
  try {
    const parsed = new URL(url);
    const x = parsed.searchParams.get("x");
    const y = parsed.searchParams.get("y");
    const z = parsed.searchParams.get("z");

    if (x && y && z) {
      const lng = parseFloat(x);
      const lat = parseFloat(y);
      const zoom = parseFloat(z);
      if (!Number.isNaN(lng) && !Number.isNaN(lat) && !Number.isNaN(zoom)) {
        return { lat, lng, zoom };
      }
    }

    const hash = parsed.hash;
    const hashMatch = hash.match(/[?&]x=([\d.-]+)[&]y=([\d.-]+)[&]z=([\d.-]+)/);
    if (hashMatch) {
      return {
        lng: parseFloat(hashMatch[1]),
        lat: parseFloat(hashMatch[2]),
        zoom: parseFloat(hashMatch[3]),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export class MapyMapAdapter {
  private movingListeners = new Set<ViewportListener>();
  private settledListeners = new Set<ViewportListener>();
  private mapContainer: HTMLElement | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private inertiaTimer: ReturnType<typeof setInterval> | null = null;
  private inertiaDeadline = 0;
  private lastHref = "";
  private lastViewport: MapViewport | null = null;
  private lastMovingFingerprint = "";
  private defaultCenter = { lat: 49.8, lng: 15.5 };
  private defaultZoom = 7;

  start(): void {
    this.findMapContainer();
    this.hookHistory();
    this.attachEvents();
    this.emitMovingIfChanged();
    this.emitSettled();
  }

  stop(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.inertiaTimer) clearInterval(this.inertiaTimer);
    this.movingListeners.clear();
    this.settledListeners.clear();
  }

  /** Fires rAF-throttled on every detected viewport change (during pan/zoom/inertia). */
  onViewportMoving(listener: ViewportListener): () => void {
    this.movingListeners.add(listener);
    if (this.lastViewport) listener(this.lastViewport);
    return () => this.movingListeners.delete(listener);
  }

  /** Fires once the viewport has been stable for SETTLE_MS. */
  onViewportSettled(listener: ViewportListener): () => void {
    this.settledListeners.add(listener);
    if (this.lastViewport) listener(this.lastViewport);
    return () => this.settledListeners.delete(listener);
  }

  getViewport(): MapViewport | null {
    return this.lastViewport;
  }

  getMapContainer(): HTMLElement | null {
    return this.mapContainer;
  }

  private findMapContainer(): void {
    const candidates = [
      "canvas.map",
      "[class*='map'] canvas",
      "canvas",
      "[class*='Map']",
      "#map",
      ".map-container",
    ];

    for (const selector of candidates) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLElement) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 200) {
          this.mapContainer = el;
          return;
        }
      }
    }

    this.mapContainer = document.body;
  }

  private hookHistory(): void {
    const emit = () => this.scheduleUpdate();
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args) => {
      originalPushState(...args);
      emit();
    };
    history.replaceState = (...args) => {
      originalReplaceState(...args);
      emit();
    };
    window.addEventListener("popstate", emit);
  }

  private attachEvents(): void {
    const onGestureEnd = () => {
      this.scheduleUpdate();
      this.startInertiaWatch();
    };
    const target = this.mapContainer ?? document;
    target.addEventListener("wheel", onGestureEnd, { passive: true });
    target.addEventListener("pointerup", onGestureEnd, { passive: true });
    target.addEventListener("touchend", onGestureEnd, { passive: true });
    window.addEventListener("resize", () => this.scheduleUpdate());
  }

  private scheduleUpdate(): void {
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.emitMovingIfChanged();
      });
    }
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.emitSettled(), SETTLE_MS);
  }

  private startInertiaWatch(): void {
    this.inertiaDeadline = performance.now() + INERTIA_WATCH_MS;
    if (this.inertiaTimer) return;
    this.lastHref = location.href;
    this.inertiaTimer = setInterval(() => {
      // tiles keep moving during inertial glide even when the URL is stable —
      // recompute every tick; the fingerprint gate makes no-op ticks cheap
      this.scheduleUpdate();
      if (location.href !== this.lastHref) {
        this.lastHref = location.href;
        this.inertiaDeadline = performance.now() + INERTIA_WATCH_MS;
      }
      if (performance.now() > this.inertiaDeadline && this.inertiaTimer) {
        clearInterval(this.inertiaTimer);
        this.inertiaTimer = null;
      }
    }, INERTIA_POLL_MS);
  }

  private computeViewport(): MapViewport {
    if (!this.mapContainer) this.findMapContainer();

    const rect = this.mapContainer?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const width = Math.max(rect.width, 100);
    const height = Math.max(rect.height, 100);

    // Primary: calibrate directly against the map tiles rendered on the page.
    // Their URLs encode z/x/y and their rects give the exact screen mapping —
    // this cannot disagree with what the user sees, regardless of URL
    // conventions, panels, or canvas layout.
    const calib = calibrate(collectTileSamples(document));
    if (calib) {
      return viewportFromCalibration(calib, {
        left: rect.left,
        top: rect.top,
        width,
        height,
      });
    }

    // Fallback: reconstruct from the URL.
    const parsed = parseMapyUrl(window.location.href);
    const center = parsed
      ? { lat: parsed.lat, lng: parsed.lng }
      : this.defaultCenter;
    const zoom = parsed?.zoom ?? this.defaultZoom;

    return viewportFromCenterZoom(center, zoom, width, height);
  }

  private emitMovingIfChanged(): void {
    const viewport = this.computeViewport();
    const fingerprint = viewportFingerprint(viewport);
    if (fingerprint === this.lastMovingFingerprint) return;

    // still gliding — keep the inertia watch alive
    if (this.inertiaTimer) {
      this.inertiaDeadline = performance.now() + INERTIA_WATCH_MS;
    }

    this.lastMovingFingerprint = fingerprint;
    this.lastViewport = viewport;
    for (const listener of this.movingListeners) {
      listener(viewport);
    }
  }

  private emitSettled(): void {
    const viewport = this.computeViewport();
    this.lastMovingFingerprint = viewportFingerprint(viewport);
    this.lastViewport = viewport;
    for (const listener of this.settledListeners) {
      listener(viewport);
    }
  }
}
