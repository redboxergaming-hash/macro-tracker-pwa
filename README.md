# Macro Tracker PWA

Privacy-first calorie and macro tracker built as a static Web App / PWA for iPhone Safari install.

## Status
This repository currently contains **Phase 2 / Commit D** scope:
- `weightLogs` store with migration-safe schema (v4)
- Weekly analytics chart + 3d/7d insight metrics
- Extended Open Food Facts parsing for additional micronutrients
- Backward-compatible cached product normalization

## OFF micronutrient parsing (Commit D)
`src/offClient.js` now parses and stores these additional nutriments (per 100g when available):
- saturated fat
- monounsaturated fat
- polyunsaturated fat
- omega-3
- omega-6
- trans fat

Rules:
- Missing nutriments are stored as `null` (never fabricated as `0`).
- Existing macro fields (`kcal100g`, `p100g`, `c100g`, `f100g`) remain unchanged.
- Cached products are normalized through `normalizeCachedProduct(...)` so older cache entries still work safely.

## IndexedDB schema
Database: `macroTrackerDB` (v4)

Stores:
- `persons`
- `entries`
- `productsCache`
- `favorites`
- `recents`
- `meta`
- `weightLogs`
This repository currently contains **Commit 8** scope:
- Persons CRUD with cascade deletes
- Daily dashboard totals
- Manual add with favorites/recent
- Export / Import / Delete-all tools
- PWA manifest + service worker offline shell
- Barcode scanning + Open Food Facts integration with local cache
- Photo workflow (manual via ChatGPT prompt copy)

## Architecture overview (Commit 8)
- **Frontend**: vanilla JavaScript (ES modules), no framework.
- **Storage**: IndexedDB (`src/storage.js`) for persons, entries, products cache, favorites, recents, and meta.
- **Barcode stack**:
  - `src/scanner.js` for camera scanning via ZXing-js.
  - `src/offClient.js` for Open Food Facts product lookup and nutrition normalization.
- **Photo workflow**:
  - local image capture/select for preview only.
  - user-driven ChatGPT app workflow via copied prompt (no automated AI recognition).
- **PWA layer**:
  - `manifest.json` for install metadata.
  - `service-worker.js` for offline shell caching and runtime strategies.

## Photo workflow (Commit 8)
Photo tab includes:
- take/select photo from camera or gallery
- local preview in app
- **Copy ChatGPT Prompt** button with exact prompt text
- instructions:
  1. Open ChatGPT app
  2. Upload photo
  3. Paste prompt
  4. Return and log manually

Manual logging supports source label:
- `Photo (manual via ChatGPT)`

## Barcode flow (Commit 7)
1. Open **Scan** tab and start camera scanning.
2. On EAN/UPC detection, app checks local `productsCache`.
3. If online, app fetches OFF product data:
   - `product_name`, `brands`, `image_front_small_url`
   - per-100g kcal (or converted from kJ), protein, carbs, fat
4. Normalized per-100g nutrition is cached locally.
5. User can log product via portion picker with source label:
   - `Barcode (Open Food Facts)`

Offline behavior:
- Cached barcode works offline.
- If barcode not cached and offline, app shows:
  - `Needs internet for first lookup.`

## Local run
Because this is an ES module app, run from a static server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Basic tests
Run helper unit tests:

```bash
node --test tests/math.test.js
```


## Data integrity (Commit G)
- Export payload includes `persons`, `entries`, `productsCache`, `favorites`, `recents`, and `weightLogs`.
- Import restores `weightLogs` and filters invalid negative/non-numeric values for entries and weight logs.
- Entry writes reject negative calories/macros/grams at storage level.
- Weight logs reject non-positive values.
- Deleting a person cascades to related `weightLogs`.
- Service worker cache updates only affect Cache Storage and do **not** clear IndexedDB stores.
