# DronMap – Drone Zones on Mapy.com

![CI](https://github.com/petrcezner/dronemapy/actions/workflows/ci.yml/badge.svg?branch=develop)

Chrome extension (Manifest V3) that overlays **Swiss**, **Czech**, **French**, **German**, **Austrian**, **Polish**, **Slovak** and **Italian** drone restriction zones on [mapy.com](https://mapy.com).

## Features

- Auto-loads restriction data based on map viewport (CH / CZ / FR / DE / AT / PL / SK / IT)
- **Crisp vector overlays** drawn on canvas (no WMS raster layers)
- **Grid-chunked loading**: only nearby map tiles are fetched where the API allows it
- **Switzerland**: BAZL zones from [geo.admin.ch](https://map.geo.admin.ch) — online REST per tile; optional offline download indexed into IndexedDB tiles
- **Czech Republic**: ŘLP ArcGIS REST bbox queries from [aimgis.rlp.cz](https://aimgis.rlp.cz) + point query on click
- **France**: DGAC/IGN WFS bbox queries from [data.geopf.fr](https://data.geopf.fr) + point query on click
- **Germany**: DIPUL (DFS/BMDV) WFS bbox queries from [uas-betrieb.de](https://uas-betrieb.de/geoservices/dipul/wfs) — control zones, restriction areas, airports, military, nature reserves
- **Austria**: Austro Control geo zones from [dronespace.at](https://utm.dronespace.at/avm/) — country-wide GeoJSON fetched once per session, clipped per tile
- **Poland**: PANSA **classic airspace + daily AUP reservations** from [airspace.pansa.pl](https://airspace.pansa.pl) (see note below)
- **Slovakia**: LPS SR **classic airspace** ArcGIS bbox queries from [gis.lps.sk](https://gis.lps.sk/vfrm) (see note below)
- **Italy**: **classic airspace** from [openAIP](https://www.openaip.net) — **requires a free API key you paste into the panel** (see note below)
- **In-map bottom toolbar** for all controls (no Chrome popup)
- Click map (without dragging) for zone details
- Optimized rendering: updates on pan/zoom settle, not during gesture

### Note on Italy coverage

Italy's official UAS geo zones are **not available** to this extension. ENAC/ENAV's
d-flight platform gates every geodata endpoint behind a login
(`allowAnonUser: false`), protects that login with a client-specific CSRF
handshake that only its own web app can produce, and publishes no open ED-269
mirror. Check official Italian geo zones on [d-flight](https://www.d-flight.it/web-app/).

What the extension can show is **classic airspace (P/R/D/CTR/ATZ…)** from
openAIP. Paste a free [openAIP API key](https://www.openaip.net) into the
panel's **Italy data access** field; it is stored on your device only (see
[PRIVACY.md](PRIVACY.md)). Until then, clicking in Italy shows a hint instead
of zones.

### Note on Poland & Slovakia coverage

PL and SK layers show **classic airspace (P/R/CTR/TRA…)**, not the legal UAS geographical zones:

- Poland's DRA geozones live behind `api.dronemap.pansa.pl`, which requires an API key issued by PANSA (not self-service). Future work: an options field for a user-supplied key.
- Slovakia's geozones are published by Dopravný úrad (NSAT) only as a KML inside a ZIP at a changing URL. Future work: fetch + convert that dataset.

## Disclaimer

This extension is an **informational aid only**. Always verify restrictions on official maps before flying:

- Switzerland: [geo.admin.ch](https://map.geo.admin.ch/#/map?lang=en&layers=ch.bazl.einschraenkungen-drohnen)
- Czech Republic: [dronemap.gov.cz](https://dronemap.gov.cz/index.php?dron)
- France: [Géoportail](https://www.geoportail.gouv.fr/donnees/restrictions-uas-categorie-ouverte-et-aeromodelisme)
- Germany: [DIPUL map tool](https://maptool-dipul.dfs.de/)
- Austria: [dronespace.at](https://utm.dronespace.at/avm/)
- Poland: [dronemap.pansa.pl](https://dronemap.pansa.pl)
- Slovakia: [NSAT geo zones](https://letectvo.nsat.sk/bezpilotne-letectvo/zemepisne-oblasti-uas/) + [VFR Manual](https://gis.lps.sk/vfrm)
- Italy: [d-flight](https://www.d-flight.it/web-app/)

## Development

### Prerequisites

- Node.js 20+ (CI runs Node 22, see `.nvmrc`)
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
- [ ] Berlin (`?x=13.40&y=52.52&z=12`) — DE control zone + zones render
- [ ] Vienna (`?x=16.37&y=48.21&z=12`) — AT geo zones render
- [ ] Warsaw (`?x=21.01&y=52.23&z=12`) — PL airspace renders (first load fetches the country feed)
- [ ] Bratislava (`?x=17.11&y=48.15&z=12`) — SK + AT zones render together (border overlap)
- [ ] Click a restricted area — info panel shows zone details
- [ ] Toggle each layer off/on — its zones disappear/reappear

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

| Region | Source | License / attribution |
|--------|--------|-----------------------|
| Switzerland | [data.geo.admin.ch](https://data.geo.admin.ch/ch.bazl.einschraenkungen-drohnen/) | Opendata BY – BAZL |
| Czech Republic | [aimgis.rlp.cz](https://aimgis.rlp.cz) REST | ŘLP ČR / AIM |
| France | [data.geopf.fr](https://data.geopf.fr) WFS | Licence Ouverte 2.0 – DGAC |
| Germany | [uas-betrieb.de](https://uas-betrieb.de/geoservices/dipul/wfs) WFS | CC BY-ND 4.0 – "dipul, CC-BY-ND 4.0" |
| Austria | [utm.dronespace.at](https://utm.dronespace.at/avm/) GeoJSON | © Austro Control GmbH (dronespace.at) |
| Poland | [airspace.pansa.pl](https://airspace.pansa.pl) JSON | PAŻP / PANSA — informational, verify NOTAM/AUP |
| Slovakia | [gis.lps.sk](https://gis.lps.sk/vfrm) ArcGIS | "VFR Manual, LPS SR š. p." – [gis.lps.sk/vfrm](https://gis.lps.sk/vfrm) |
| Italy | [openAIP](https://www.openaip.net) API (user's key) | openAIP contributors — airspace, not UAS geo zones |

## Privacy

See [PRIVACY.md](PRIVACY.md).
