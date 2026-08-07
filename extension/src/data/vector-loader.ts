import type { Feature, Geometry } from "geojson";
import type {
  CountryRegion,
  ExtensionSettings,
  MapViewport,
  Region,
} from "../../types";
import type { ActiveSource } from "./country-registry";
import { activeSourcesFor, COUNTRY_SOURCES } from "./country-registry";
import type { CountrySource, CountrySubSource } from "./country-source";
import { dedupeFeatures, filterFeaturesToBounds } from "./feature-bbox";
import { tilesForBounds, tileBounds } from "./grid";
import { clampBoundsToRadius, MAX_FETCH_RADIUS_KM } from "./regional-bounds";
import { TileFeatureCache } from "./tile-feature-cache";
import { getZoneEntries, putZoneEntries } from "./zone-tile-cache";

const PADDING_TILES = 1;
/** A tile with a failed source is retried after this long instead of staying empty. */
const FAILED_TILE_RETRY_MS = 15_000;

// The persistent cache is read/written directly from the content script —
// routing megabytes of GeoJSON through extension messaging (double structured
// clone + service-worker cold starts) proved slower than the network it saved.
async function zoneCacheGet(
  keys: string[]
): Promise<Record<string, Feature<Geometry>[]>> {
  if (keys.length === 0) return {};
  try {
    return await getZoneEntries(keys);
  } catch {
    return {}; // e.g. storage unavailable in private mode
  }
}

function zoneCachePut(entries: Record<string, Feature<Geometry>[]>): void {
  if (Object.keys(entries).length === 0) return;
  putZoneEntries(entries).catch(() => {});
}

const persistKey = (sub: CountrySubSource, tileId: string) =>
  `${sub.cacheKeyPrefix}/${tileId}`;

export class VectorLoader {
  /** Called whenever a tile's data lands in the memory cache (progressive draw). */
  onTilesLoaded?: () => void;

  private generation = 0;
  private inflight = new Map<string, Promise<void>>();

  constructor(
    private memoryCache = new TileFeatureCache(),
    private registry: readonly CountrySource[] = COUNTRY_SOURCES
  ) {}

  clearCache(): void {
    this.memoryCache.clear();
    this.generation++;
  }

  async loadForViewport(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ): Promise<Feature<Geometry>[]> {
    const { clampedBounds, tileIds, active } = this.plan(
      viewport,
      region,
      settings
    );
    if (active.length === 0) return [];

    const missing = this.memoryCache.getMissing(tileIds);
    if (missing.length > 0) {
      await this.fetchMissingTiles(missing, active);
    }

    return this.collect(tileIds, clampedBounds);
  }

  /** True when every tile needed for this viewport is already in the memory cache. */
  hasDataForViewport(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ): boolean {
    const { tileIds, active } = this.plan(viewport, region, settings);
    if (active.length === 0) return true;
    return this.memoryCache.getMissing(tileIds).length === 0;
  }

  /** Synchronous view of whatever is already in the memory cache — no fetching. */
  peekForViewport(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ): Feature<Geometry>[] {
    const { clampedBounds, tileIds, active } = this.plan(
      viewport,
      region,
      settings
    );
    if (active.length === 0) return [];
    return this.collect(tileIds, clampedBounds);
  }

  private plan(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ) {
    const clampedBounds = clampBoundsToRadius(
      viewport.bounds,
      viewport.center,
      MAX_FETCH_RADIUS_KM
    );
    return {
      clampedBounds,
      tileIds: tilesForBounds(clampedBounds, PADDING_TILES),
      active: activeSourcesFor(region, settings.layers, this.registry),
    };
  }

  private collect(
    tileIds: string[],
    bounds: MapViewport["bounds"]
  ): Feature<Geometry>[] {
    const merged = this.memoryCache.getMany(tileIds);
    const deduped = dedupeFeatures(merged);
    return filterFeaturesToBounds(deduped, bounds);
  }

  private async fetchMissingTiles(
    tileIds: string[],
    active: ActiveSource[]
  ): Promise<void> {
    const gen = this.generation;

    // bulk local tiles (e.g. the Swiss offline download), once per batch
    const localByRegion = new Map<Region, Record<string, Feature<Geometry>[]>>();
    for (const { country } of active) {
      if (country.getLocalTiles && !localByRegion.has(country.region)) {
        localByRegion.set(country.region, await country.getLocalTiles(tileIds));
      }
    }

    // one round trip to the persistent per-source cache for everything missing
    const wantKeys: string[] = [];
    for (const id of tileIds) {
      for (const { country, sub } of active) {
        if (sub.persist === false) continue;
        if (localByRegion.get(country.region)?.[id]?.length) continue;
        wantKeys.push(persistKey(sub, id));
      }
    }
    const stored = await zoneCacheGet(wantKeys);

    const toPersist: Record<string, Feature<Geometry>[]> = {};
    const fingerprint = active.map((a) => a.sub.cacheKeyPrefix).join(",");

    await Promise.all(
      tileIds.map((id) => {
        if (this.memoryCache.get(id)) return Promise.resolve();
        const inflightKey = `${id}|${fingerprint}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) return existing;

        const job = this.fetchTile(
          id,
          active,
          localByRegion,
          stored,
          toPersist,
          gen
        ).finally(() => this.inflight.delete(inflightKey));
        this.inflight.set(inflightKey, job);
        return job;
      })
    );

    zoneCachePut(toPersist);
  }

  private async fetchTile(
    tileId: string,
    active: ActiveSource[],
    localByRegion: Map<Region, Record<string, Feature<Geometry>[]>>,
    stored: Record<string, Feature<Geometry>[]>,
    toPersist: Record<string, Feature<Geometry>[]>,
    gen: number
  ): Promise<void> {
    const bounds = tileBounds(tileId);
    const parts: Feature<Geometry>[] = [];
    let hadError = false;

    await Promise.all(
      active.map(async ({ country, sub }) => {
        const local = localByRegion.get(country.region)?.[tileId];
        if (local?.length) {
          parts.push(...local);
          return;
        }
        const key = persistKey(sub, tileId);
        const cached = sub.persist === false ? undefined : stored[key];
        if (cached) {
          parts.push(...cached);
          return;
        }
        try {
          const online = await sub.fetchForBounds(bounds);
          parts.push(...online);
          if (sub.persist !== false) toPersist[key] = online;
        } catch {
          hadError = true;
        }
      })
    );

    if (gen !== this.generation) return; // settings changed mid-flight

    this.memoryCache.put(tileId, parts);
    this.onTilesLoaded?.();

    // show what arrived, but retry the tile soon so a flaky connection
    // doesn't leave permanent holes
    if (hadError) {
      setTimeout(() => {
        if (gen === this.generation) this.memoryCache.delete(tileId);
      }, FAILED_TILE_RETRY_MS);
    }
  }
}
