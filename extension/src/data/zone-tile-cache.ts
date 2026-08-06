import type { Feature, Geometry } from "geojson";
import { openDb, ZONE_STORE } from "./swiss-tile-store";

/** Zone geometries change rarely; a week of persistence saves most re-downloads. */
export const ZONE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface ZoneCacheRow {
  key: string;
  features: Feature<Geometry>[];
  savedAt: number;
}

/** Fetch cached entries for the given keys; expired rows are skipped and pruned. */
export async function getZoneEntries(
  keys: string[]
): Promise<Record<string, Feature<Geometry>[]>> {
  if (keys.length === 0) return {};
  const db = await openDb();
  const now = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ZONE_STORE, "readwrite");
    const store = tx.objectStore(ZONE_STORE);
    const out: Record<string, Feature<Geometry>[]> = {};
    let pending = keys.length;

    for (const key of keys) {
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result as ZoneCacheRow | undefined;
        if (row) {
          if (now - row.savedAt <= ZONE_CACHE_TTL_MS) {
            out[key] = row.features;
          } else {
            store.delete(key);
          }
        }
        pending--;
        if (pending === 0) resolve(out);
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function putZoneEntries(
  entries: Record<string, Feature<Geometry>[]>
): Promise<void> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return;
  const db = await openDb();
  const savedAt = Date.now();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ZONE_STORE, "readwrite");
    const store = tx.objectStore(ZONE_STORE);
    for (const key of keys) {
      store.put({ key, features: entries[key], savedAt } satisfies ZoneCacheRow);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
