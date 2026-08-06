import type { Feature, Geometry } from "geojson";
import type { CountryRegion, ExtensionSettings, MapViewport } from "../../types";
import {
  enabledCzechSources,
  fetchCzechSourceFeatures,
  type CzechBboxSource,
} from "./czech";
import { dedupeFeatures, filterFeaturesToBounds } from "./feature-bbox";
import { fetchFranceFeaturesForBounds } from "./france";
import { tilesForBounds, tileBounds } from "./grid";
import { clampBoundsToRadius, MAX_FETCH_RADIUS_KM } from "./regional-bounds";
import { sendRuntimeMessage } from "../shared/runtime-messaging";
import { fetchSwissFeaturesForBounds } from "./switzerland";
import { TileFeatureCache } from "./tile-feature-cache";
import { getZoneEntries, putZoneEntries } from "./zone-tile-cache";

const PADDING_TILES = 1;
/** A tile with a failed source is retried after this long instead of staying empty. */
const FAILED_TILE_RETRY_MS = 15_000;

async function fetchSwissTilesFromIdb(
  tileIds: string[]
): Promise<Record<string, Feature<Geometry>[]>> {
  const response = await sendRuntimeMessage<{
    tiles?: Record<string, Feature<Geometry>[]>;
  }>({ type: "GET_SWISS_TILES", tileIds });
  return response?.tiles ?? {};
}

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

const swissKey = (tileId: string) => `ch/identify/${tileId}`;
const czechKey = (source: CzechBboxSource, tileId: string) =>
  `cz/${source.service}/${source.layerId}/${tileId}`;
const franceKey = (tileId: string) => `fr/uas/${tileId}`;

export class VectorLoader {
  /** Called whenever a tile's data lands in the memory cache (progressive draw). */
  onTilesLoaded?: () => void;

  private generation = 0;
  private inflight = new Map<string, Promise<void>>();

  constructor(private memoryCache = new TileFeatureCache()) {}

  clearCache(): void {
    this.memoryCache.clear();
    this.generation++;
  }

  async loadForViewport(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ): Promise<Feature<Geometry>[]> {
    const { clampedBounds, tileIds, needSwiss, needCzech, needFrance } = this.plan(
      viewport,
      region,
      settings
    );
    if (!needSwiss && !needCzech && !needFrance) return [];

    const missing = this.memoryCache.getMissing(tileIds);
    if (missing.length > 0) {
      await this.fetchMissingTiles(missing, needSwiss, needCzech, needFrance, settings);
    }

    return this.collect(tileIds, clampedBounds);
  }

  /** True when every tile needed for this viewport is already in the memory cache. */
  hasDataForViewport(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ): boolean {
    const { tileIds, needSwiss, needCzech, needFrance } = this.plan(viewport, region, settings);
    if (!needSwiss && !needCzech && !needFrance) return true;
    return this.memoryCache.getMissing(tileIds).length === 0;
  }

  /** Synchronous view of whatever is already in the memory cache — no fetching. */
  peekForViewport(
    viewport: MapViewport,
    region: CountryRegion,
    settings: ExtensionSettings
  ): Feature<Geometry>[] {
    const { clampedBounds, tileIds, needSwiss, needCzech, needFrance } = this.plan(
      viewport,
      region,
      settings
    );
    if (!needSwiss && !needCzech && !needFrance) return [];
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
      needSwiss: region.includes("CH") && settings.layers.switzerland,
      needCzech: region.includes("CZ") && this.hasCzechLayer(settings.layers),
      needFrance: region.includes("FR") && settings.layers.france,
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

  private hasCzechLayer(layers: ExtensionSettings["layers"]): boolean {
    return (
      layers.czechHop ||
      layers.czechGrids ||
      layers.czechProtected ||
      layers.czechMilitary
    );
  }

  private async fetchMissingTiles(
    tileIds: string[],
    needSwiss: boolean,
    needCzech: boolean,
    needFrance: boolean,
    settings: ExtensionSettings
  ): Promise<void> {
    const gen = this.generation;
    const czechSources = needCzech ? enabledCzechSources(settings.layers) : [];

    // full-country Swiss offline download, if the user fetched it
    let idbTiles: Record<string, Feature<Geometry>[]> = {};
    if (needSwiss) {
      idbTiles = await fetchSwissTilesFromIdb(tileIds);
    }

    // one round trip to the persistent per-source cache for everything missing
    const wantKeys: string[] = [];
    for (const id of tileIds) {
      if (needSwiss && !idbTiles[id]?.length) wantKeys.push(swissKey(id));
      if (needFrance) wantKeys.push(franceKey(id));
      for (const s of czechSources) wantKeys.push(czechKey(s, id));
    }
    const stored = await zoneCacheGet(wantKeys);

    const toPersist: Record<string, Feature<Geometry>[]> = {};
    const layersFp = czechSources.map((s) => `${s.service}/${s.layerId}`).join(",");

    await Promise.all(
      tileIds.map((id) => {
        if (this.memoryCache.get(id)) return Promise.resolve();
        const inflightKey = `${id}|${needSwiss}|${needFrance}|${layersFp}`;
        const existing = this.inflight.get(inflightKey);
        if (existing) return existing;

        const job = this.fetchTile(
          id,
          needSwiss,
          needFrance,
          czechSources,
          idbTiles,
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
    needSwiss: boolean,
    needFrance: boolean,
    czechSources: CzechBboxSource[],
    idbTiles: Record<string, Feature<Geometry>[]>,
    stored: Record<string, Feature<Geometry>[]>,
    toPersist: Record<string, Feature<Geometry>[]>,
    gen: number
  ): Promise<void> {
    const bounds = tileBounds(tileId);
    const parts: Feature<Geometry>[] = [];
    let hadError = false;

    const swissTask = async () => {
      if (!needSwiss) return;
      const offline = idbTiles[tileId];
      if (offline?.length) {
        parts.push(...offline);
        return;
      }
      const cached = stored[swissKey(tileId)];
      if (cached) {
        parts.push(...cached);
        return;
      }
      try {
        const online = await fetchSwissFeaturesForBounds(bounds);
        parts.push(...online);
        toPersist[swissKey(tileId)] = online;
      } catch {
        hadError = true;
      }
    };

    const franceTask = async () => {
      if (!needFrance) return;
      const cached = stored[franceKey(tileId)];
      if (cached) {
        parts.push(...cached);
        return;
      }
      try {
        const online = await fetchFranceFeaturesForBounds(bounds);
        parts.push(...online);
        toPersist[franceKey(tileId)] = online;
      } catch {
        hadError = true;
      }
    };

    const czechTasks = czechSources.map((source) => async () => {
      const cached = stored[czechKey(source, tileId)];
      if (cached) {
        parts.push(...cached);
        return;
      }
      try {
        const features = await fetchCzechSourceFeatures(source, bounds);
        parts.push(...features);
        toPersist[czechKey(source, tileId)] = features;
      } catch {
        hadError = true;
      }
    });

    await Promise.all([swissTask(), franceTask(), ...czechTasks.map((t) => t())]);

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
