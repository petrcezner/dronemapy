import type { CountryRegion, ExtensionSettings, MessageType } from "../../types";
import { COUNTRY_BY_REGION, COUNTRY_SOURCES } from "../data/country-registry";
import { sendRuntimeMessage } from "../shared/runtime-messaging";

export interface MapPanelCallbacks {
  onSettingsChange: (partial: Partial<ExtensionSettings>) => void;
  onDownloadSwiss: () => Promise<void>;
}

function regionLabel(region: CountryRegion): string {
  if (region.length === 0) return "Outside zones";
  return region.map((r) => COUNTRY_BY_REGION[r].displayName).join(" & ");
}

// registry-driven blocks of the panel markup (labels/URLs are our constants)
function officialLinksHtml(): string {
  return COUNTRY_SOURCES.map(
    (c) =>
      `<a href="${c.officialMap.url}" target="_blank" rel="noopener">${c.officialMap.label}</a>`
  ).join("\n          ");
}

function attributionHtml(): string {
  return COUNTRY_SOURCES.map(
    (c) =>
      `<a href="${c.attribution.url}" target="_blank" rel="noopener">${c.attribution.label}</a>`
  ).join(" / ");
}

export class MapPanel {
  private root: HTMLDivElement;
  private expanded: HTMLDivElement;
  private regionEl: HTMLSpanElement;
  private enabledEl: HTMLInputElement;
  private opacityEl: HTMLInputElement;
  private swissStatusEl: HTMLParagraphElement;
  private downloadBtn: HTMLButtonElement;
  private clickPopupsEl: HTMLInputElement;
  private layerInputs: Record<string, HTMLInputElement> = {};
  private callbacks: MapPanelCallbacks;
  private settings: ExtensionSettings;

  constructor(parent: HTMLElement, settings: ExtensionSettings, callbacks: MapPanelCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;

    this.root = document.createElement("div");
    this.root.className = "dronmap-panel-root";
    this.root.innerHTML = `
      <div class="dronmap-panel-expanded dronmap-hidden" id="dronmap-expanded">
        <h3>Layers</h3>
        <div class="dronmap-panel-layers" id="dronmap-layers"></div>
        <label class="dronmap-panel-option">
          <input type="checkbox" id="dronmap-click-popups" />
          <span>Show zone info pop-up on click</span>
        </label>
        <div class="dronmap-panel-swiss">
          <h3>Swiss offline cache (optional)</h3>
          <p id="dronmap-swiss-status">Checking…</p>
          <button type="button" id="dronmap-download-swiss">Download for offline (~13 MB)</button>
        </div>
        <div class="dronmap-panel-links">
          ${officialLinksHtml()}
        </div>
        <p class="dronmap-panel-disclaimer">Informational only. Verify on official maps before flying. PL/SK layers show classic airspace, not UAS geo zones.</p>
        <p class="dronmap-panel-attribution">Data: ${attributionHtml()}</p>
      </div>
      <div class="dronmap-panel-bar">
        <span class="dronmap-panel-brand">DronMap</span>
        <label class="dronmap-panel-toggle">
          <input type="checkbox" id="dronmap-enabled" />
          <span>Overlay</span>
        </label>
        <span class="dronmap-panel-region" id="dronmap-region">—</span>
        <label class="dronmap-panel-opacity">
          <span>Opacity</span>
          <input type="range" id="dronmap-opacity" min="10" max="90" />
        </label>
        <button type="button" class="dronmap-panel-btn" id="dronmap-expand-btn">Layers ▲</button>
        <button type="button" class="dronmap-panel-btn" id="dronmap-hide-btn" title="Hide panel">✕</button>
      </div>
    `;

    parent.appendChild(this.root);

    this.expanded = this.root.querySelector("#dronmap-expanded") as HTMLDivElement;
    this.regionEl = this.root.querySelector("#dronmap-region") as HTMLSpanElement;
    this.enabledEl = this.root.querySelector("#dronmap-enabled") as HTMLInputElement;
    this.opacityEl = this.root.querySelector("#dronmap-opacity") as HTMLInputElement;
    this.swissStatusEl = this.root.querySelector("#dronmap-swiss-status") as HTMLParagraphElement;
    this.downloadBtn = this.root.querySelector("#dronmap-download-swiss") as HTMLButtonElement;
    this.clickPopupsEl = this.root.querySelector("#dronmap-click-popups") as HTMLInputElement;

    this.buildLayerInputs();
    this.bindEvents();
    this.applySettings(settings);
    void this.updateSwissStatus();
  }

  private buildLayerInputs(): void {
    const container = this.root.querySelector("#dronmap-layers")!;
    const layers: { id: keyof ExtensionSettings["layers"]; label: string }[] =
      COUNTRY_SOURCES.flatMap((c) =>
        c.layerToggles.map((t) => ({ id: t.key, label: t.label }))
      );

    for (const layer of layers) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `dronmap-layer-${layer.id}`;
      label.appendChild(input);
      label.appendChild(document.createTextNode(layer.label));
      container.appendChild(label);
      this.layerInputs[layer.id] = input;
    }
  }

  private bindEvents(): void {
    this.enabledEl.addEventListener("change", () => {
      this.callbacks.onSettingsChange({ enabled: this.enabledEl.checked });
    });

    this.opacityEl.addEventListener("input", () => {
      this.callbacks.onSettingsChange({
        opacity: parseInt(this.opacityEl.value, 10) / 100,
      });
    });

    this.clickPopupsEl.addEventListener("change", () => {
      this.callbacks.onSettingsChange({ clickPopups: this.clickPopupsEl.checked });
    });

    for (const [key, input] of Object.entries(this.layerInputs)) {
      input.addEventListener("change", () => {
        this.callbacks.onSettingsChange({
          layers: { [key]: input.checked } as ExtensionSettings["layers"],
        });
      });
    }

    this.root.querySelector("#dronmap-expand-btn")?.addEventListener("click", () => {
      const expanded = !this.settings.panelExpanded;
      this.callbacks.onSettingsChange({ panelExpanded: expanded });
    });

    this.root.querySelector("#dronmap-hide-btn")?.addEventListener("click", () => {
      this.callbacks.onSettingsChange({ panelVisible: false });
    });

    this.downloadBtn.addEventListener("click", async () => {
      this.downloadBtn.disabled = true;
      this.swissStatusEl.textContent = "Downloading…";
      try {
        await this.callbacks.onDownloadSwiss();
        await this.updateSwissStatus();
      } finally {
        this.downloadBtn.disabled = false;
      }
    });
  }

  applySettings(settings: ExtensionSettings): void {
    this.settings = settings;
    this.enabledEl.checked = settings.enabled;
    this.opacityEl.value = String(Math.round(settings.opacity * 100));
    this.clickPopupsEl.checked = settings.clickPopups;

    for (const [key, input] of Object.entries(this.layerInputs)) {
      // missing key = stored settings predate this layer → default enabled
      input.checked =
        settings.layers[key as keyof typeof settings.layers] !== false;
    }

    this.root.classList.toggle("dronmap-panel-hidden", !settings.panelVisible);
    this.expanded.classList.toggle("dronmap-hidden", !settings.panelExpanded);
    this.root.classList.toggle("dronmap-panel-has-expanded", settings.panelExpanded);

    const expandBtn = this.root.querySelector("#dronmap-expand-btn");
    if (expandBtn) {
      expandBtn.textContent = settings.panelExpanded ? "Layers ▼" : "Layers ▲";
    }
  }

  setRegion(region: CountryRegion): void {
    this.regionEl.textContent = regionLabel(region);
  }

  setSwissLoading(loading: boolean): void {
    if (loading) {
      this.swissStatusEl.textContent = "Loading Swiss data…";
    }
  }

  setSwissIndexing(): void {
    this.swissStatusEl.textContent = "Indexing tiles…";
  }

  toggleVisible(): void {
    this.callbacks.onSettingsChange({ panelVisible: !this.settings.panelVisible });
  }

  async updateSwissStatus(): Promise<void> {
    const status = await sendRuntimeMessage<{
      indexed: boolean;
      tileCount: number;
      updatedAt: string | null;
    }>({ type: "SWISS_DATA_STATUS" });
    if (status?.indexed && status.updatedAt) {
      this.swissStatusEl.textContent = `Offline tiles: ${status.tileCount} (indexed ${new Date(status.updatedAt).toLocaleString()})`;
    } else {
      this.swissStatusEl.textContent = "Online only – vectors load per map tile via REST";
    }
  }

  destroy(): void {
    this.root.remove();
  }
}

export function saveSettings(
  partial: Partial<ExtensionSettings>
): Promise<ExtensionSettings | undefined> {
  return sendRuntimeMessage<ExtensionSettings>(
    { type: "SET_SETTINGS", settings: partial } satisfies MessageType
  );
}
