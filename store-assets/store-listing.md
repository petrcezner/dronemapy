# Chrome Web Store listing — DroneMapy

Everything below is ready to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). One-time developer registration fee: $5.

## Store listing tab

**Name** (from manifest): DroneMapy – Drone Zones on Mapy.com

**Short description** (≤132 chars, from manifest):

> Overlay Swiss, Czech, French, German, Austrian, Polish, Slovak and Italian drone restriction zones on mapy.com

**Detailed description:**

> DroneMapy overlays official drone restriction zones directly on mapy.com, so you can check where you may fly while planning routes on the map you already use.
>
> COVERAGE
> • Switzerland – FOCA/BAZL drone restriction zones (geo.admin.ch), with optional ~13 MB offline dataset
> • Czech Republic – ŘLP/AIM restriction layers (aim.rlp.cz)
> • France – Géoportail drone restriction layers (data.geopf.fr)
> • Germany – DIPUL geo zones (uas-betrieb.de)
> • Austria – Austro Control geo zones (dronespace.at)
> • Poland – PANSA airspace and daily reservations (classic airspace only)
> • Slovakia – LPS SR airspace layers (classic airspace only)
> • Italy – openAIP airspace (requires your free openAIP API key; official d-flight zones are not publicly accessible)
>
> FEATURES
> • Zones drawn as vector overlays on canvas, tiled to the viewport for smooth panning and zooming
> • Click any point on the map to see zone details: restriction, altitude limits, authority, contact
> • Per-country layer toggles, opacity control, altitude legend, metric/imperial units
> • Data fetched straight from official aviation-authority servers — no middleman server
> • No account, no tracking, no data collection
>
> DISCLAIMER
> DroneMapy is an independent project, not affiliated with Seznam.cz / mapy.com or any aviation authority. The overlay is informational only and may be incomplete or out of date. Always verify against official sources and current NOTAMs before flying, and follow local drone regulations.

**Category:** Tools

**Language:** English

**Graphic assets:**

| Asset | File | Status |
|---|---|---|
| Store icon 128×128 | `extension/assets/icons/icon128.png` | ✓ generated |
| Screenshots 1280×800 (up to 5) | `docs/screenshots/hero-prague.jpg`, `zone-details.jpg`, `zurich.jpg`, `berlin.jpg`, `layers-panel.jpg` | ✓ correct size |
| Small promo tile 440×280 | `store-assets/promo-tile-440x280.png` | ✓ generated |
| Marquee 1400×560 | — | optional, not created |

## Privacy tab

**Single purpose description:**

> Overlays official drone restriction zones on mapy.com maps so drone pilots can check flight restrictions while planning on the map.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves user preferences (layer toggles, opacity, units) and caches downloaded zone datasets locally so they are not re-downloaded on every visit. |
| `alarms` | Schedules a weekly background check for an updated Swiss offline dataset. |
| Host `mapy.com`, `*.mapy.com` | The single site the extension runs on: injects the zone overlay and layer panel into the map page. |
| Host `*.geo.admin.ch`, `data.geo.admin.ch` | Fetches official Swiss drone restriction zone data (FOCA/BAZL). |
| Host `aimgis.rlp.cz`, `aim.rlp.cz` | Fetches official Czech restriction layers (ŘLP AIM). |
| Host `data.geopf.fr` | Fetches official French drone restriction layers (IGN Géoportail). |
| Host `uas-betrieb.de` | Fetches official German DIPUL geo zone layers (DFS). |
| Host `utm.dronespace.at` | Fetches official Austrian geo zones (Austro Control). |
| Host `airspace.pansa.pl` | Fetches official Polish airspace and daily reservation data (PANSA). |
| Host `gis.lps.sk` | Fetches official Slovak airspace layers (LPS SR). |
| Host `api.core.openaip.net` | Fetches Italian airspace data, only when the user saves their own free openAIP API key. |

**Remote code:** No, I am not using remote code. (All logic ships in the package; network requests fetch data only — GeoJSON/JSON/WFS.)

**Data usage disclosures:** check **none** of the data-collection categories. The extension collects no personal or sensitive user data. The optional openAIP API key is provided by the user, stored in `chrome.storage.local` on-device, and sent only to openAIP.

Certify: "I do not sell or transfer user data to third parties…" — all three certifications apply truthfully.

**Privacy policy URL:** `https://petrcezner.github.io/dronemapy/privacy`

⚠️ Requires enabling GitHub Pages once: repo **Settings → Pages → Deploy from a branch → branch `develop` (or `master` after merge), folder `/docs`**. The policy source is `docs/privacy.md` (mirrors `PRIVACY.md`).

## Distribution tab

- **Visibility:** Public (or Unlisted for a soft launch)
- **Regions:** All regions (the zones are European, but there is no reason to geo-restrict)
- **Pricing:** Free

## Upload

Build the submission zip:

```bash
npm run package   # → dronemapy-v<version>.zip (zip of extension/dist contents)
```

Upload the zip on the "Package" tab. Review typically takes a few business days; host-permission extensions can take longer.
