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
