import type {
  ExtensionSettings,
  MessageType,
  SwissFeatureCollection,
} from "../../types";
import { mergeStoredSettings } from "../../types";
import { POLAND_AUP_URL, POLAND_STATIC_URL } from "../data/poland";
import { fetchItalyZones, italyStatus, setOpenAipKey } from "./italy-sources";
import {
  CH_GEOJSON_URL,
  downloadSwissGeoJson,
  fetchSwissStacUpdated,
} from "../data/switzerland";
import {
  getSwissMeta,
  getSwissTiles,
  hasSwissTiles,
  indexSwissGeoJson,
  migrateLegacySwissBlobIfNeeded,
} from "../data/swiss-tile-store";

async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get("settings");
  // deep-merges `layers`, so countries added after the user stored their
  // settings still default to enabled
  return mergeStoredSettings(result.settings as Partial<ExtensionSettings>);
}

async function setSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next = { ...current, ...partial };
  if (partial.layers) {
    next.layers = { ...current.layers, ...partial.layers };
  }
  await chrome.storage.sync.set({ settings: next });
  return next;
}

async function ensureSwissTilesIndexed(force = false): Promise<void> {
  await migrateLegacySwissBlobIfNeeded();

  if (!force && (await hasSwissTiles())) return;

  const stacUpdated = await fetchSwissStacUpdated();
  const meta = await getSwissMeta();
  if (!force && meta && (!stacUpdated || meta.stacUpdated === stacUpdated)) {
    return;
  }

  try {
    const data = await downloadSwissGeoJson();
    await indexSwissGeoJson(data, stacUpdated);
  } catch (err) {
    console.error("[DronMap] Swiss tile indexing failed:", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("swissDataRefresh", { periodInMinutes: 10080 });
  void migrateLegacySwissBlobIfNeeded();
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id || !tab.url?.includes("mapy.com")) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }).catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "swissDataRefresh") {
    void ensureSwissTilesIndexed(true);
  }
});

chrome.runtime.onMessage.addListener(
  (message: MessageType, _sender, sendResponse) => {
    void (async () => {
      switch (message.type) {
        case "GET_SETTINGS": {
          sendResponse(await getSettings());
          break;
        }
        case "SET_SETTINGS": {
          const settings = await setSettings(message.settings);
          const tabs = await chrome.tabs.query({
            url: ["https://mapy.com/*", "https://*.mapy.com/*"],
          });
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "SETTINGS_UPDATED",
                settings,
              }).catch(() => {});
            }
          }
          sendResponse(settings);
          break;
        }
        // airspace.pansa.pl sends no CORS headers, so the content script
        // cannot fetch it — the worker fetches under host_permissions instead
        case "FETCH_POLAND_AIRSPACE": {
          try {
            const url =
              message.feed === "aup" ? POLAND_AUP_URL : POLAND_STATIC_URL;
            const res = await fetch(url);
            if (!res.ok) {
              sendResponse({ features: null });
              break;
            }
            const data = await res.json();
            // the feeds return a bare array of Features
            sendResponse({
              features: Array.isArray(data) ? data : data?.features ?? null,
            });
          } catch {
            sendResponse({ features: null });
          }
          break;
        }
        // Italy needs the user's own openAIP key, so the worker owns the
        // fetch — the key never reaches page context
        case "SET_OPENAIP_KEY": {
          await setOpenAipKey(message.key);
          sendResponse({ ok: true });
          break;
        }
        case "ITALY_STATUS": {
          sendResponse(await italyStatus());
          break;
        }
        case "FETCH_ITALY_ZONES": {
          sendResponse(await fetchItalyZones(message.bounds));
          break;
        }
        case "GET_SWISS_TILES": {
          await migrateLegacySwissBlobIfNeeded();
          const tiles = await getSwissTiles(message.tileIds);
          sendResponse({ tiles });
          break;
        }
        case "DOWNLOAD_SWISS_DATA": {
          try {
            const data = await downloadSwissGeoJson((progress) => {
              chrome.runtime.sendMessage({
                type: "SWISS_DOWNLOAD_PROGRESS",
                progress,
                status: "downloading",
              } satisfies MessageType).catch(() => {});
            });

            chrome.runtime.sendMessage({
              type: "SWISS_DOWNLOAD_PROGRESS",
              progress: 100,
              status: "indexing",
            } satisfies MessageType).catch(() => {});

            const stacUpdated = await fetchSwissStacUpdated();
            const meta = await indexSwissGeoJson(
              data as SwissFeatureCollection,
              stacUpdated
            );

            chrome.runtime.sendMessage({
              type: "SWISS_DOWNLOAD_PROGRESS",
              progress: 100,
              status: "done",
            } satisfies MessageType).catch(() => {});

            sendResponse({ ok: true, meta });
          } catch (err) {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : "Download failed",
            });
          }
          break;
        }
        case "SWISS_DATA_STATUS": {
          await migrateLegacySwissBlobIfNeeded();
          const meta = await getSwissMeta();
          sendResponse({
            indexed: !!meta?.tileCount,
            tileCount: meta?.tileCount ?? 0,
            updatedAt: meta?.indexedAt ?? null,
            url: CH_GEOJSON_URL,
          });
          break;
        }
        default:
          sendResponse(null);
      }
    })();
    return true;
  }
);

export { getSettings, hasSwissTiles, getSwissMeta };
