import type { Feature, Geometry } from "geojson";

// generous LRU so panning around a region doesn't thrash back to storage;
// trimmed features make entries small enough
const MAX_ENTRIES = 128;

export class TileFeatureCache {
  private entries = new Map<string, Feature<Geometry>[]>();

  get(tileId: string): Feature<Geometry>[] | undefined {
    const features = this.entries.get(tileId);
    if (!features) return undefined;
    this.touch(tileId, features);
    return features;
  }

  put(tileId: string, features: Feature<Geometry>[]): void {
    this.entries.delete(tileId);
    this.entries.set(tileId, features);
    this.evict();
  }

  getMissing(tileIds: string[]): string[] {
    return tileIds.filter((id) => !this.entries.has(id));
  }

  getMany(tileIds: string[]): Feature<Geometry>[] {
    const out: Feature<Geometry>[] = [];
    for (const id of tileIds) {
      const features = this.get(id);
      if (features) out.push(...features);
    }
    return out;
  }

  delete(tileId: string): void {
    this.entries.delete(tileId);
  }

  clear(): void {
    this.entries.clear();
  }

  private touch(tileId: string, features: Feature<Geometry>[]): void {
    this.entries.delete(tileId);
    this.entries.set(tileId, features);
  }

  private evict(): void {
    while (this.entries.size > MAX_ENTRIES) {
      const first = this.entries.keys().next().value;
      if (first) this.entries.delete(first);
    }
  }
}
