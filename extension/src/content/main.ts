import type { CountryRegion, ExtensionSettings, MessageType } from "../../types";
import { DEFAULT_SETTINGS, mergeStoredSettings } from "../../types";
import type { MapViewport } from "../../types";
import { sendRuntimeMessage } from "../shared/runtime-messaging";
import { MapyMapAdapter } from "./map-adapter";
import { OverlayRenderer } from "./overlay-renderer";
import { ClickHandler } from "./click-handler";
import { MapPanel, saveSettings } from "./map-panel";
import { AltitudeLegend } from "./altitude-legend";
import { detectRegion } from "../data/country-registry";
import { VectorLoader } from "../data/vector-loader";
import {
  MAX_FETCH_RADIUS_KM,
  MIN_RADIUS_COVERAGE,
  radiusCoverageRatio,
} from "../data/regional-bounds";
import { computeFollowTransform, type FollowTransform } from "../data/projection";
import { viewportFingerprint } from "../data/viewport-fingerprint";

const IDENTITY_FOLLOW: FollowTransform = { tx: 0, ty: 0, scale: 1 };
/** Hide instead of transform when the stale raster would be shifted this far off. */
const MAX_FOLLOW_SHIFT_RATIO = 0.4;
/** Coalesce progressive tile redraws to at most one per interval. */
const PROGRESSIVE_RENDER_MS = 150;

class DronMapController {
  private adapter = new MapyMapAdapter();
  private renderer: OverlayRenderer | null = null;
  private clickHandler: ClickHandler | null = null;
  private panel: MapPanel | null = null;
  private legend: AltitudeLegend | null = null;
  private vectorLoader = new VectorLoader();
  private settings: ExtensionSettings = DEFAULT_SETTINGS;
  private lastFetchedFingerprint = "";
  private vectorFetchToken = 0;
  private panelMounted = false;
  private dragStart: { x: number; y: number } | null = null;
  private currentFollow: FollowTransform = IDENTITY_FOLLOW;
  private progressiveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProgressiveRender = 0;

  async init(): Promise<void> {
    this.settings = await this.loadSettings();
    this.vectorLoader.onTilesLoaded = () => this.scheduleProgressiveRender();
    this.setupMessageListener();
    this.waitForMapAndStart();
  }

  /**
   * Redraw from cache as individual tiles arrive, instead of waiting for all.
   * Throttled: staggered tile completions coalesce into at most one redraw
   * per interval, since each redraw walks every cached feature.
   */
  private scheduleProgressiveRender(): void {
    if (this.progressiveTimer !== null) return;
    const elapsed = performance.now() - this.lastProgressiveRender;
    const delay = Math.max(0, PROGRESSIVE_RENDER_MS - elapsed);
    this.progressiveTimer = setTimeout(() => {
      this.progressiveTimer = null;
      this.lastProgressiveRender = performance.now();
      if (!this.renderer || !this.settings.enabled || this.dragStart) return;
      const viewport = this.adapter.getViewport();
      if (!viewport) return;
      const region = detectRegion(viewport.center.lat, viewport.center.lng);
      if (this.isBelowZoomGate(viewport, region)) return;
      this.renderFromCache(viewport, region);
    }, delay);
  }

  private async loadSettings(): Promise<ExtensionSettings> {
    const response = await sendRuntimeMessage<Partial<ExtensionSettings>>({
      type: "GET_SETTINGS",
    });
    return mergeStoredSettings(response);
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message: MessageType) => {
      if (message.type === "SETTINGS_UPDATED") {
        this.settings = message.settings;
        this.panel?.applySettings(this.settings);
        this.legend?.setUnits(this.settings.units);
        if (!this.clickPopupsEnabled()) this.clickHandler?.hide();
        this.vectorLoader.clearCache();
        this.rerenderCurrent();
      }
      if (message.type === "TOGGLE_PANEL") {
        this.panel?.toggleVisible();
      }
      if (message.type === "SWISS_DOWNLOAD_PROGRESS" && message.status === "indexing") {
        this.panel?.setSwissIndexing();
      }
    });
  }

  private waitForMapAndStart(): void {
    const tryStart = () => {
      this.adapter.start();
      const container = this.adapter.getMapContainer();
      if (!container) {
        setTimeout(tryStart, 500);
        return;
      }
      this.mountOverlay(container);
      this.adapter.onViewportMoving((viewport) => this.handleMoving(viewport));
      this.adapter.onViewportSettled(
        (viewport) => void this.ensureDataAndRender(viewport)
      );
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryStart);
    } else {
      tryStart();
    }
  }

  private mountOverlay(container: HTMLElement): void {
    if (this.panelMounted) return;
    this.panelMounted = true;

    const parent = container.parentElement ?? container;
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }

    this.renderer = new OverlayRenderer(parent, container);
    this.clickHandler = new ClickHandler(document.body);
    this.clickHandler.attach(
      container,
      () => this.adapter.getViewport(),
      () => this.clickPopupsEnabled(),
      () => this.settings.units
    );
    this.attachDragFollow(container);
    this.legend = new AltitudeLegend(document.body, this.settings.units);

    this.panel = new MapPanel(document.body, this.settings, {
      onSettingsChange: (partial) => void this.handleSettingsChange(partial),
      onDownloadSwiss: () => this.downloadSwissData(),
      onItalyAccessChange: () => {
        // Italian tiles fetched while unconfigured were never cached, but a
        // sign-out must drop the ones that were
        this.vectorLoader.clearCache();
        this.rerenderCurrent();
      },
    });
  }

  /** Keep the overlay glued to the map during an active drag via pure translation. */
  private attachDragFollow(target: HTMLElement): void {
    target.addEventListener(
      "pointerdown",
      (e: PointerEvent) => {
        if (e.button !== 0) return;
        this.dragStart = { x: e.clientX, y: e.clientY };
      },
      { passive: true }
    );

    target.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        if (!this.dragStart || !this.settings.enabled || !this.renderer) return;
        if (e.buttons === 0) {
          this.dragStart = null;
          return;
        }
        const base = this.currentFollow;
        this.renderer.setFollowTransform(
          base.tx + (e.clientX - this.dragStart.x),
          base.ty + (e.clientY - this.dragStart.y),
          base.scale
        );
      },
      { passive: true }
    );

    window.addEventListener(
      "pointerup",
      (e: PointerEvent) => {
        if (!this.dragStart) return;
        const base = this.currentFollow;
        this.currentFollow = {
          tx: base.tx + (e.clientX - this.dragStart.x),
          ty: base.ty + (e.clientY - this.dragStart.y),
          scale: base.scale,
        };
        this.dragStart = null;
        // the map may keep gliding (inertia); dim until a fresh draw lands
        this.renderer?.setUncertain(true);
      },
      { passive: true }
    );
  }

  private handleMoving(viewport: MapViewport): void {
    if (!this.renderer || !this.settings.enabled) return;
    if (this.dragStart) return; // drag translation owns the canvas right now

    const region = detectRegion(viewport.center.lat, viewport.center.lng);
    this.panel?.setRegion(region);

    if (this.isBelowZoomGate(viewport, region)) {
      this.showZoomHint();
      return;
    }
    this.renderer.setZoomHint(false);
    this.updateLegend(region);

    if (this.vectorLoader.hasDataForViewport(viewport, region, this.settings)) {
      this.renderFromCache(viewport, region);
    } else {
      this.followToViewport(viewport);
    }
  }

  /** Reposition the last-drawn raster to match `current` until fresh data arrives. */
  private followToViewport(current: MapViewport): void {
    if (!this.renderer) return;
    const drawn = this.renderer.getLastDrawnViewport();
    if (!drawn) return;

    const t = computeFollowTransform(drawn, current);
    const maxShift =
      MAX_FOLLOW_SHIFT_RATIO * Math.max(drawn.width, drawn.height) * t.scale;
    if (
      Math.abs(t.tx) > maxShift ||
      Math.abs(t.ty) > maxShift ||
      t.scale < 0.25 ||
      t.scale > 4
    ) {
      this.renderer.setFollowHidden(true);
      return;
    }
    this.currentFollow = t;
    this.renderer.setFollowHidden(false);
    this.renderer.setUncertain(true);
    this.renderer.setFollowTransform(t.tx, t.ty, t.scale);
  }

  private isBelowZoomGate(viewport: MapViewport, region: CountryRegion): boolean {
    return (
      region.length > 0 &&
      radiusCoverageRatio(viewport, MAX_FETCH_RADIUS_KM) < MIN_RADIUS_COVERAGE
    );
  }

  private showZoomHint(): void {
    if (!this.renderer) return;
    this.renderer.resetFollowTransform();
    this.currentFollow = IDENTITY_FOLLOW;
    this.renderer.clearVector();
    this.renderer.setZoomHint(true);
    this.legend?.setVisible(false);
  }

  /** Show the AGL altitude legend only where it applies: CZ airport-grid layer, drawn in. */
  private updateLegend(region: CountryRegion): void {
    this.legend?.setVisible(
      this.settings.enabled &&
        this.settings.layers.czechGrids &&
        region.includes("CZ")
    );
  }

  /** Synchronous draw of whatever is cached — never touches the network. */
  private renderFromCache(viewport: MapViewport, region: CountryRegion): void {
    if (!this.renderer) return;
    this.renderer.syncSize();
    this.renderer.setOpacity(this.settings.opacity);
    const features = this.vectorLoader.peekForViewport(
      viewport,
      region,
      this.settings
    );
    this.renderer.setFollowHidden(false);
    this.renderer.setUncertain(false);
    this.renderer.drawPolygons(features, viewport); // resets follow transform
    this.currentFollow = IDENTITY_FOLLOW;
  }

  private async ensureDataAndRender(
    viewport: MapViewport,
    force = false
  ): Promise<void> {
    if (!this.renderer) return;

    if (!this.settings.enabled) {
      this.renderer.setVisible(false);
      this.renderer.clearVector();
      this.renderer.setZoomHint(false);
      this.clickHandler?.setEnabled(() => false);
      this.lastFetchedFingerprint = "";
      this.legend?.setVisible(false);
      return;
    }

    this.renderer.setVisible(true);
    this.clickHandler?.setEnabled(() => this.clickPopupsEnabled());

    const region = detectRegion(viewport.center.lat, viewport.center.lng);
    this.panel?.setRegion(region);

    if (this.isBelowZoomGate(viewport, region)) {
      this.showZoomHint();
      return;
    }
    this.renderer.setZoomHint(false);
    this.updateLegend(region);

    const fingerprint = viewportFingerprint(viewport);
    if (!force && fingerprint === this.lastFetchedFingerprint) {
      this.renderFromCache(viewport, region);
      return;
    }
    this.lastFetchedFingerprint = fingerprint;

    const token = ++this.vectorFetchToken;
    await this.vectorLoader.loadForViewport(viewport, region, this.settings);
    if (token !== this.vectorFetchToken) return;

    // draw against wherever the map is NOW, not where the fetch started
    const current = this.adapter.getViewport() ?? viewport;
    const currentRegion = detectRegion(current.center.lat, current.center.lng);
    if (this.isBelowZoomGate(current, currentRegion)) {
      this.showZoomHint();
      return;
    }
    this.updateLegend(currentRegion);
    this.renderFromCache(current, currentRegion);
  }

  private rerenderCurrent(): void {
    this.lastFetchedFingerprint = "";
    const viewport = this.adapter.getViewport();
    if (viewport) void this.ensureDataAndRender(viewport, true);
  }

  private clickPopupsEnabled(): boolean {
    return this.settings.enabled && this.settings.clickPopups;
  }

  private async handleSettingsChange(
    partial: Partial<ExtensionSettings>
  ): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    if (partial.layers) {
      this.settings.layers = { ...this.settings.layers, ...partial.layers };
    }
    // a layer switched off leaves its features in already-merged tiles;
    // drop the memory cache so the next draw refetches without them
    if (partial.layers && Object.values(partial.layers).some((v) => v === false)) {
      this.vectorLoader.clearCache();
    }
    if (partial.clickPopups === false) {
      this.clickHandler?.hide();
    }
    if (partial.units) {
      this.legend?.setUnits(partial.units);
    }
    await saveSettings(partial);
    this.rerenderCurrent();
  }

  private async downloadSwissData(): Promise<void> {
    await sendRuntimeMessage({ type: "DOWNLOAD_SWISS_DATA" });
    this.vectorLoader.clearCache();
    void this.panel?.updateSwissStatus();
  }
}

void new DronMapController().init();
