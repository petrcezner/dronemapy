# Graph Report - .  (2026-07-21)

## Corpus Check
- Corpus is ~13,757 words - fits in a single context window. You may not need a graph.

## Summary
- 355 nodes · 763 edges · 19 communities (12 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.87)
- Token cost: 0 input · 109,941 output

## Community Hubs (Navigation)
- Mapy.com Map Adapter
- Czech Airspace Restrictions
- Overlay Rendering
- Extension Manifest
- Region & Settings Config
- Swiss/Czech Feature Loading
- Privacy & Data Sources
- Build Dependencies
- Swiss Tile Store Service Worker
- TypeScript Config
- GeoJSON Chunking
- Drone Map Controller
- Click Handler
- Map Panel UI
- Tile Feature Cache
- Extension Icons
- Extension Icons
- Extension Icons

## God Nodes (most connected - your core abstractions)
1. `MapViewport` - 34 edges
2. `DronMapController` - 23 edges
3. `OverlayRenderer` - 21 edges
4. `ExtensionSettings` - 20 edges
5. `ClickHandler` - 18 edges
6. `MapyMapAdapter` - 17 edges
7. `DronMap Chrome Extension` - 15 edges
8. `MapPanel` - 14 edges
9. `compilerOptions` - 13 edges
10. `VectorLoader` - 12 edges

## Surprising Connections (you probably didn't know these)
- `DronMap Chrome Extension (Privacy Policy Subject)` --references--> `DronMap Chrome Extension`  [INFERRED]
  PRIVACY.md → README.md
- `geo.admin.ch / data.geo.admin.ch (Swiss Source)` --references--> `geo.admin.ch (Swiss BAZL Data Source)`  [INFERRED]
  PRIVACY.md → README.md
- `aimgis.rlp.cz (Czech Source)` --references--> `aimgis.rlp.cz (Czech ArcGIS REST)`  [INFERRED]
  PRIVACY.md → README.md
- `IndexedDB Swiss Zone Cache (~13 MB)` --references--> `IndexedDB Offline Tile Cache`  [INFERRED]
  PRIVACY.md → README.md
- `alarms Permission (Weekly Swiss Dataset Check)` --conceptually_related_to--> `IndexedDB Offline Tile Cache`  [INFERRED]
  PRIVACY.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **External Government Data Sources (CH/CZ)** — readme_geoadminch, readme_aimgisrlpcz, privacy_geoadminch, privacy_aimgisrlpcz [INFERRED 0.80]
- **Local-Only Data Handling (No Server Transmission)** — privacy_nodatacollection, privacy_chromestoragesync, privacy_indexeddbcache, privacy_permissions_storage [INFERRED 0.80]

## Communities (19 total, 7 thin omitted)

### Community 0 - "Mapy.com Map Adapter"
Cohesion: 0.13
Nodes (14): MapyMapAdapter, ParsedMapyUrl, parseMapyUrl(), ViewportListener, calibrate(), collectTileSamples(), median(), parseTileUrl() (+6 more)

### Community 1 - "Czech Airspace Restrictions"
Cohesion: 0.13
Nodes (26): escapeHtml(), buildCzechQueryUrl(), CZECH_BBOX_SOURCES, CZECH_LAYER_STYLES, CZECH_REST_LAYERS, CzechRestLayer, CzechZoneStyle, fetchCzechSourceFeatures() (+18 more)

### Community 2 - "Overlay Rendering"
Cohesion: 0.10
Nodes (9): DEBUG_LANDMARKS, debugEnabled(), flattenCoordinates(), getRestrictionColor(), OverlayRenderer, readRestriction(), RESTRICTION_COLORS, getCzechStyle() (+1 more)

### Community 3 - "Extension Manifest"
Cohesion: 0.07
Nodes (27): action, default_icon, default_title, background, service_worker, type, content_scripts, 128 (+19 more)

### Community 4 - "Region & Settings Config"
Cohesion: 0.14
Nodes (18): IDENTITY_FOLLOW, REGION_LABELS, saveSettings(), boundsFromCenterRadius(), clampBoundsToRadius(), expandBounds(), isBoundsInside(), quantizeBounds() (+10 more)

### Community 5 - "Swiss/Czech Feature Loading"
Cohesion: 0.18
Nodes (15): CzechBboxSource, enabledCzechSources(), fetchSwissFeaturesForBounds(), czechKey(), fetchSwissTilesFromIdb(), swissKey(), VectorLoader, zoneCacheGet() (+7 more)

### Community 6 - "Privacy & Data Sources"
Cohesion: 0.10
Nodes (25): aimgis.rlp.cz (Czech Source), chrome.storage.sync (Preferences Storage), DronMap Chrome Extension (Privacy Policy Subject), geo.admin.ch / data.geo.admin.ch (Swiss Source), IndexedDB Swiss Zone Cache (~13 MB), No Personal Data Collection Policy, alarms Permission (Weekly Swiss Dataset Check), storage Permission (+17 more)

### Community 7 - "Build Dependencies"
Cohesion: 0.08
Nodes (23): @crxjs/vite-plugin, devDependencies, @crxjs/vite-plugin, @types/chrome, @types/geojson, typescript, vite, vitest (+15 more)

### Community 8 - "Swiss Tile Store Service Worker"
Cohesion: 0.20
Nodes (20): ensureSwissTilesIndexed(), getSettings(), setSettings(), chunkGeoJsonToRecord(), clearLegacyBlob(), clearSwissTiles(), getLegacyBlob(), getSwissMeta() (+12 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.08
Nodes (23): chrome, DOM, DOM.Iterable, ES2022, extension/src/**/*, extension/types/**/*, vite/client, vite.config.ts (+15 more)

### Community 10 - "GeoJSON Chunking"
Cohesion: 0.22
Nodes (16): chunkGeoJson(), SAMPLE, tilesForFeatureBBox(), bboxCache, dedupeFeatures(), featureBBox, featureDedupeKey(), featureIntersectsBounds() (+8 more)

## Knowledge Gaps
- **89 isolated node(s):** `manifest_version`, `name`, `version`, `description`, `storage` (+84 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MapViewport` connect `Swiss/Czech Feature Loading` to `Mapy.com Map Adapter`, `Czech Airspace Restrictions`, `Overlay Rendering`, `Region & Settings Config`, `Swiss Tile Store Service Worker`, `GeoJSON Chunking`, `Drone Map Controller`, `Click Handler`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `OverlayRenderer` connect `Overlay Rendering` to `Drone Map Controller`, `Region & Settings Config`, `Swiss/Czech Feature Loading`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `MapyMapAdapter` connect `Mapy.com Map Adapter` to `Region & Settings Config`, `Swiss/Czech Feature Loading`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `manifest_version`, `name`, `version` to the rest of the system?**
  _89 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mapy.com Map Adapter` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._
- **Should `Czech Airspace Restrictions` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Overlay Rendering` be split into smaller, more focused modules?**
  _Cohesion score 0.10114942528735632 - nodes in this community are weakly interconnected._