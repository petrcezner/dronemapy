import type { MapViewport } from "../../types";

// Italy has no anonymous zone source. ENAC/ENAV's d-flight platform gates all
// geodata behind Keycloak (`allowAnonUser: false`) and its login endpoint is
// additionally protected by a client-specific CSRF handshake, so third-party
// clients cannot authenticate — the official geo zones stay on d-flight's own
// site. What remains usable is openAIP, which serves Italian *airspace*
// (CTR/P/R/D…) with a free per-user API key. The key lives in the worker so it
// never enters page context.

export const OPENAIP_AIRSPACES_URL =
  "https://api.core.openaip.net/api/airspaces";
const OPENAIP_KEY_STORAGE = "openAipKey";

export async function getOpenAipKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(OPENAIP_KEY_STORAGE);
  const key = result[OPENAIP_KEY_STORAGE];
  return typeof key === "string" && key.length > 0 ? key : null;
}

export async function setOpenAipKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed) {
    await chrome.storage.local.set({ [OPENAIP_KEY_STORAGE]: trimmed });
  } else {
    await chrome.storage.local.remove(OPENAIP_KEY_STORAGE);
  }
}

export async function italyStatus(): Promise<{ openaip: boolean }> {
  return { openaip: (await getOpenAipKey()) !== null };
}

export function buildOpenAipUrl(bounds: MapViewport["bounds"]): string {
  const params = new URLSearchParams({
    // openAIP takes lon,lat order
    bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`,
    country: "IT",
    limit: "1000",
  });
  return `${OPENAIP_AIRSPACES_URL}?${params}`;
}

export interface ItalyFetchResult {
  /** Raw upstream records; shaping happens in src/data/italy.ts. */
  items: unknown[] | null;
  /** Set when unusable, so the tile is retried rather than cached empty. */
  error?: "not_configured" | "unauthorized" | "failed";
}

export async function fetchItalyZones(
  bounds: MapViewport["bounds"]
): Promise<ItalyFetchResult> {
  const key = await getOpenAipKey();
  if (!key) return { items: null, error: "not_configured" };
  try {
    const res = await fetch(buildOpenAipUrl(bounds), {
      headers: { "x-openaip-api-key": key },
    });
    if (res.status === 401 || res.status === 403) {
      return { items: null, error: "unauthorized" };
    }
    if (!res.ok) return { items: null, error: "failed" };
    const data = await res.json();
    return { items: data?.items ?? [] };
  } catch {
    return { items: null, error: "failed" };
  }
}
