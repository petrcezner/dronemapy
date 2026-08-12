import type {
  CountryRegion,
  ExtensionSettings,
  ItalyAccessStatus,
  MessageType,
  Units,
} from "../../types";
import { COUNTRY_BY_REGION, COUNTRY_SOURCES } from "../data/country-registry";
import { sendRuntimeMessage } from "../shared/runtime-messaging";

type LayerKey = keyof ExtensionSettings["layers"];

export type MasterState = "on" | "off" | "mixed";

/** Aggregate state of a country's layer toggles; missing keys count as on. */
export function masterState(
  layers: ExtensionSettings["layers"],
  keys: LayerKey[]
): MasterState {
  const on = keys.filter((k) => layers[k] !== false).length;
  if (on === keys.length) return "on";
  if (on === 0) return "off";
  return "mixed";
}

/** Summary shown next to the Italy section header. */
export function italyStatusLabel(
  status: ItalyAccessStatus | null | undefined
): string {
  return status?.openaip ? "— openAIP key set" : "— not configured";
}

export interface MapPanelCallbacks {
  onSettingsChange: (partial: Partial<ExtensionSettings>) => void;
  onDownloadSwiss: () => Promise<void>;
  /** The openAIP key changed — drop caches so Italian zones (re)load. */
  onItalyAccessChange: () => void;
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
  private masterInputs: { input: HTMLInputElement; keys: LayerKey[] }[] = [];
  private unitInputs: HTMLInputElement[] = [];
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
        <div class="dronmap-panel-units">
          <span>Units</span>
          <label><input type="radio" name="dronmap-units" value="metric" /> Metric (m)</label>
          <label><input type="radio" name="dronmap-units" value="imperial" /> Imperial (ft)</label>
        </div>
        <div class="dronmap-panel-italy">
          <h3>Italy data access <span id="dronmap-italy-status">…</span></h3>
          <p class="dronmap-panel-hint">
            Italy needs a key you provide. Paste a free
            <a href="https://www.openaip.net" target="_blank" rel="noopener">openAIP</a>
            API key for Italian airspace; it is stored on this device only.
            ENAC/ENAV's <a href="https://www.d-flight.it" target="_blank" rel="noopener">d-flight</a>
            has no anonymous access and its login is closed to third-party
            clients, so official Italian UAS geo zones must be checked there.
          </p>
          <div class="dronmap-italy-form">
            <input type="password" id="dronmap-openaip-key" placeholder="openAIP API key" autocomplete="off" />
            <button type="button" id="dronmap-openaip-save">Save key</button>
            <button type="button" id="dronmap-openaip-clear">Clear</button>
          </div>
          <p class="dronmap-italy-error" id="dronmap-italy-error"></p>
        </div>
        <div class="dronmap-panel-swiss">
          <h3>Swiss offline cache (optional)</h3>
          <p id="dronmap-swiss-status">Checking…</p>
          <button type="button" id="dronmap-download-swiss">Download for offline (~13 MB)</button>
        </div>
        <div class="dronmap-panel-links">
          ${officialLinksHtml()}
        </div>
        <p class="dronmap-panel-disclaimer">Informational only. Verify on official maps before flying. PL/SK/IT layers show classic airspace, not UAS geo zones.</p>
        <p class="dronmap-panel-attribution">Data: ${attributionHtml()}</p>
      </div>
      <div class="dronmap-panel-bar">
        <span class="dronmap-panel-brand">DroneMapy</span>
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
    this.unitInputs = [
      ...this.root.querySelectorAll<HTMLInputElement>("input[name='dronmap-units']"),
    ];

    this.buildLayerInputs();
    this.bindEvents();
    this.bindItalyEvents();
    this.applySettings(settings);
    void this.updateSwissStatus();
    void this.updateItalyStatus();
  }

  private bindItalyEvents(): void {
    const el = <T extends HTMLElement>(id: string) =>
      this.root.querySelector(id) as T;
    const key = el<HTMLInputElement>("#dronmap-openaip-key");
    const error = el<HTMLParagraphElement>("#dronmap-italy-error");

    const finish = (message = "") => {
      error.textContent = message;
      void this.updateItalyStatus();
      this.callbacks.onItalyAccessChange();
    };

    el<HTMLButtonElement>("#dronmap-openaip-save").addEventListener(
      "click",
      async () => {
        await sendRuntimeMessage({ type: "SET_OPENAIP_KEY", key: key.value });
        key.value = "";
        finish();
      }
    );

    el<HTMLButtonElement>("#dronmap-openaip-clear").addEventListener(
      "click",
      async () => {
        await sendRuntimeMessage({ type: "SET_OPENAIP_KEY", key: "" });
        key.value = "";
        finish();
      }
    );
  }

  async updateItalyStatus(): Promise<void> {
    const statusEl = this.root.querySelector("#dronmap-italy-status");
    if (!statusEl) return;
    const status = await sendRuntimeMessage<ItalyAccessStatus>({
      type: "ITALY_STATUS",
    });
    statusEl.textContent = italyStatusLabel(status);
  }

  private buildLayerInputs(): void {
    const container = this.root.querySelector("#dronmap-layers")!;
    // display order only — registry order still drives detection/styles
    const countries = [...COUNTRY_SOURCES].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    for (const country of countries) {
      const row = document.createElement("div");
      row.className = "dronmap-layer-country";

      // single-layer country: its one checkbox IS the country row
      if (country.layerToggles.length === 1) {
        const toggle = country.layerToggles[0];
        row.appendChild(this.makeLayerCheckbox(toggle.key, toggle.label));
        container.appendChild(row);
        continue;
      }

      // master checkbox toggling every sub-layer at once
      const keys = country.layerToggles.map((t) => t.key);
      const label = document.createElement("label");
      const master = document.createElement("input");
      master.type = "checkbox";
      master.id = `dronmap-master-${country.region}`;
      label.appendChild(master);
      label.appendChild(document.createTextNode(country.displayName));
      row.appendChild(label);

      const expander = document.createElement("button");
      expander.type = "button";
      expander.className = "dronmap-layer-expander";
      expander.textContent = "▸";
      expander.setAttribute("aria-label", `Show ${country.displayName} layers`);
      row.appendChild(expander);
      container.appendChild(row);

      const sublist = document.createElement("div");
      sublist.className = "dronmap-layer-sublist dronmap-hidden";
      for (const toggle of country.layerToggles) {
        sublist.appendChild(this.makeLayerCheckbox(toggle.key, toggle.label));
      }
      container.appendChild(sublist);

      // expand state is session-local on purpose — not worth persisting
      expander.addEventListener("click", () => {
        const hidden = sublist.classList.toggle("dronmap-hidden");
        expander.textContent = hidden ? "▸" : "▾";
      });

      this.masterInputs.push({ input: master, keys });
    }
  }

  private makeLayerCheckbox(key: LayerKey, labelText: string): HTMLLabelElement {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `dronmap-layer-${key}`;
    label.appendChild(input);
    label.appendChild(document.createTextNode(labelText));
    this.layerInputs[key] = input;
    return label;
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

    for (const { input, keys } of this.masterInputs) {
      input.addEventListener("change", () => {
        const layers = Object.fromEntries(
          keys.map((k) => [k, input.checked])
        ) as unknown as ExtensionSettings["layers"];
        this.callbacks.onSettingsChange({ layers });
      });
    }

    for (const radio of this.unitInputs) {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          this.callbacks.onSettingsChange({ units: radio.value as Units });
        }
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

    for (const { input, keys } of this.masterInputs) {
      const state = masterState(settings.layers, keys);
      input.checked = state === "on";
      input.indeterminate = state === "mixed";
    }

    for (const radio of this.unitInputs) {
      radio.checked = radio.value === settings.units;
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
