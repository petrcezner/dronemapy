# DronMap – Drone Zones on Mapy.com

Chrome extension (Manifest V3) that overlays **Swiss**, **Czech** and **French** UAS drone restriction zones on [mapy.com](https://mapy.com).

## Features

- Auto-loads restriction data based on map viewport (Switzerland / Czech Republic / France)
- **Crisp vector overlays** drawn on canvas (no WMS raster layers)
- **Grid-chunked loading**: only nearby map tiles are fetched, not whole countries
- **Switzerland**: BAZL zones from [geo.admin.ch](https://map.geo.admin.ch) — online REST per tile; optional offline download indexed into IndexedDB tiles
- **Czech Republic**: ŘLP ArcGIS REST bbox queries from [aimgis.rlp.cz](https://aimgis.rlp.cz) + point query on click
- **France**: DGAC/IGN WFS bbox queries from [data.geopf.fr](https://data.geopf.fr) + point query on click
- **In-map bottom toolbar** for all controls (no Chrome popup)
- Click map (without dragging) for zone details
- Optimized rendering: updates on pan/zoom settle, not during gesture

## Disclaimer

This extension is an **informational aid only**. Always verify restrictions on official maps before flying:

- Switzerland: [geo.admin.ch](https://map.geo.admin.ch/#/map?lang=en&layers=ch.bazl.einschraenkungen-drohnen)
- Czech Republic: [dronemap.gov.cz](https://dronemap.gov.cz/index.php?dron)

## Development

### Prerequisites

- Node.js 18+
- Google Chrome

### Setup

```bash
npm install
npm run dev
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/dist`

### Build for production

```bash
npm run build
```

### Tests

```bash
npm test
```

## Usage on mapy.com

1. Open [mapy.com](https://mapy.com) — a **DronMap** bottom toolbar appears on the map
2. Use **Overlay** toggle, opacity slider, and **Layers ▲** to expand layer options
3. Click the extension icon in Chrome to show/hide the toolbar
4. Click the map (tap without dragging) to inspect zone details

Zones load for **your current viewport** only, split into ~0.25° grid tiles with a one-tile padding ring. Switzerland can work online immediately; download optional offline tiles from the panel for faster repeat visits without network.

## Manual QA checklist

- [ ] Open mapy.com with extension loaded — bottom toolbar visible, no console errors
- [ ] Pan/zoom rapidly — map stays smooth; sharp vector zones update ~350ms after stopping
- [ ] Toggle overlay off/on from bottom bar
- [ ] Click extension icon — toolbar hides/shows
- [ ] Prague (`?x=14.43&y=50.08&z=12`) — CZ vector polygons visible after settle (no PNG flicker)
- [ ] Zurich (`?x=8.54&y=47.37&z=12`) online — CH vectors from REST without download
- [ ] Download Swiss tiles from expanded panel, then Zurich offline — vectors from IndexedDB
- [ ] Click a restricted area — info panel shows zone details

## Project structure

```
extension/
  manifest.json
  src/
    background/     # Service worker (tile index, settings, icon click)
    content/        # Map adapter, overlay, map panel, click handler
    data/           # Grid tiles, vector loader, projection, regions
    styles/         # Overlay + panel CSS
```

## Data sources & attribution

| Region | Source | License |
|--------|--------|---------|
| Switzerland | [data.geo.admin.ch](https://data.geo.admin.ch/ch.bazl.einschraenkungen-drohnen/) | Opendata BY – BAZL |
| Czech Republic | [aimgis.rlp.cz](https://aimgis.rlp.cz) REST | ŘLP ČR / AIM |
| France | [data.geopf.fr](https://data.geopf.fr) WFS | Licence Ouverte 2.0 – DGAC |

## Privacy

See [PRIVACY.md](PRIVACY.md).
