# Privacy Policy – DronMap Chrome Extension

**Last updated:** August 2026

## Summary

DronMap does **not** collect, store, or transmit any personal data. All processing happens locally in your browser.

## What the extension does

- Injects an overlay on **mapy.com** to display public drone restriction zone data
- Downloads public aviation datasets from official aviation-authority servers:
  - `geo.admin.ch` / `data.geo.admin.ch` (Switzerland)
  - `aimgis.rlp.cz` (Czech Republic)
  - `data.geopf.fr` (France)
  - `uas-betrieb.de` (Germany — DIPUL/DFS)
  - `utm.dronespace.at` (Austria — Austro Control)
  - `airspace.pansa.pl` (Poland — PANSA)
  - `gis.lps.sk` (Slovakia — LPS SR)
- Stores your preferences (layer toggles, opacity) in `chrome.storage.sync`
- Caches Swiss zone GeoJSON (~13 MB) and per-tile zone data in IndexedDB on your device

## What we do NOT collect

- No account or login
- No analytics or tracking
- No location history sent to any server
- No data sold to third parties

## Permissions explained

| Permission | Why |
|------------|-----|
| `storage` | Save your settings and cache Swiss zone data locally |
| `alarms` | Weekly check for updated Swiss dataset |
| `mapy.com` | Inject overlay on the map page |
| `geo.admin.ch` / `data.geo.admin.ch` | Fetch Swiss drone zone data |
| `aimgis.rlp.cz` / `aim.rlp.cz` | Fetch Czech restriction layers |
| `data.geopf.fr` | Fetch French drone restriction layers |
| `uas-betrieb.de` | Fetch German DIPUL geo zone layers |
| `utm.dronespace.at` | Fetch Austrian geo zones |
| `airspace.pansa.pl` | Fetch Polish airspace + daily reservations |
| `gis.lps.sk` | Fetch Slovak airspace layers |

## Contact

For questions about this extension, open an issue in the project repository.

## Changes

We may update this policy if the extension's behavior changes. Material changes will be reflected in the extension version notes.
