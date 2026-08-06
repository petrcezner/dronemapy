import type { Feature, Geometry } from "geojson";
import type { SwissFeatureCollection } from "../../types";
import { chunkGeoJsonToRecord } from "./chunk-geojson";

export const DB_NAME = "dronmap";
export const DB_VERSION = 3;
export const LEGACY_STORE = "swissData";
export const TILES_STORE = "swissTiles";
export const META_STORE = "swissMeta";
/** Per-source per-tile online fetch cache (CZ + CH), TTL-based. */
export const ZONE_STORE = "zoneTiles";

export interface SwissTileMeta {
  version: number;
  stacUpdated: string | null;
  indexedAt: string;
  tileCount: number;
}

interface LegacyStoredSwissData {
  data: SwissFeatureCollection;
  updatedAt: string;
  stacUpdated: string | null;
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE);
      }
      if (!db.objectStoreNames.contains(TILES_STORE)) {
        db.createObjectStore(TILES_STORE, { keyPath: "tileId" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
      if (!db.objectStoreNames.contains(ZONE_STORE)) {
        db.createObjectStore(ZONE_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSwissMeta(): Promise<SwissTileMeta | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get("meta");
    req.onsuccess = () => resolve((req.result as SwissTileMeta) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function hasSwissTiles(): Promise<boolean> {
  const meta = await getSwissMeta();
  return meta != null && meta.tileCount > 0;
}

export async function getSwissTiles(
  tileIds: string[]
): Promise<Record<string, Feature<Geometry>[]>> {
  if (tileIds.length === 0) return {};
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TILES_STORE, "readonly");
    const store = tx.objectStore(TILES_STORE);
    const out: Record<string, Feature<Geometry>[]> = {};
    let pending = tileIds.length;

    for (const tileId of tileIds) {
      const req = store.get(tileId);
      req.onsuccess = () => {
        const row = req.result as { tileId: string; features: Feature<Geometry>[] } | undefined;
        if (row?.features?.length) {
          out[tileId] = row.features;
        }
        pending--;
        if (pending === 0) resolve(out);
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function indexSwissGeoJson(
  collection: SwissFeatureCollection,
  stacUpdated: string | null
): Promise<SwissTileMeta> {
  const chunked = chunkGeoJsonToRecord(collection);
  const tileIds = Object.keys(chunked);
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TILES_STORE, "readwrite");
    const store = tx.objectStore(TILES_STORE);
    store.clear();
    for (const tileId of tileIds) {
      store.put({ tileId, features: chunked[tileId] });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  const meta: SwissTileMeta = {
    version: 1,
    stacUpdated,
    indexedAt: new Date().toISOString(),
    tileCount: tileIds.length,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    const req = tx.objectStore(META_STORE).put(meta, "meta");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  await clearLegacyBlob();
  return meta;
}

export async function clearSwissTiles(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([TILES_STORE, META_STORE], "readwrite");
    tx.objectStore(TILES_STORE).clear();
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getLegacyBlob(): Promise<LegacyStoredSwissData | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEGACY_STORE, "readonly");
    const req = tx.objectStore(LEGACY_STORE).get("geojson");
    req.onsuccess = () => resolve((req.result as LegacyStoredSwissData) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function clearLegacyBlob(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEGACY_STORE, "readwrite");
    const req = tx.objectStore(LEGACY_STORE).delete("geojson");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Migrate monolithic GeoJSON blob to grid tiles if present. */
export async function migrateLegacySwissBlobIfNeeded(): Promise<SwissTileMeta | null> {
  if (await hasSwissTiles()) return getSwissMeta();

  const legacy = await getLegacyBlob();
  if (!legacy?.data) return null;

  return indexSwissGeoJson(legacy.data, legacy.stacUpdated);
}
