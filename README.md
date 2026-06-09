# zgm-gliwice

A Chrome extension that surfaces auction price history for ZGM Gliwice municipal properties — so that when browsing an active auction listing you can see whether the property has been unsold before, how many times, at what prices, and how the city has been adjusting the asking price.

**The data pipeline now lives in [`110kc3/przetargimiejskie`](https://github.com/110kc3/przetargimiejskie)**, the multi-city successor that was built on top of this project. It scrapes + OCRs the ZGM Gliwice auction PDFs (and eight other Silesian cities) and publishes per-city JSON. This repo no longer scrapes anything itself: it **mirrors the Gliwice slice** of that published data into [`data/gliwice/`](./data/gliwice) and serves it to the extension from `raw.githubusercontent.com`. No server, no paid service, no hosted database. See [PLAN.md](./PLAN.md) for the original architecture rationale.

## What's here

| Path | What it is |
|---|---|
| [`extension/`](./extension) | The Chrome extension (MV3, no build step). **This is the product.** |
| [`scripts/sync-from-przetargimiejskie.mjs`](./scripts/sync-from-przetargimiejskie.mjs) | Mirrors `data/gliwice/{properties,active,meta}.json` from the canonical przetargimiejskie pipeline into this repo. |
| [`data/gliwice/properties.json`](./data/gliwice/properties.json) | One record per unique `(street, building, apt)` with the full chronological listings history. **The file the extension consumes.** |
| [`data/gliwice/active.json`](./data/gliwice/active.json) | Currently-active auctions and "wykaz" pre-announcements. |
| [`data/gliwice/meta.json`](./data/gliwice/meta.json) | Provenance: when the data was generated, schema/parser versions, counts. |
| [`.github/workflows/refresh.yml`](./.github/workflows/refresh.yml) | Weekly GitHub Actions cron that re-syncs the Gliwice data and commits any deltas. |
| [`spike/ocr_samples/`](./spike/ocr_samples) | Raw OCR fixtures from the original spike (kept for reference). |
| [`PLAN.md`](./PLAN.md) | Full architecture & form-factor comparison. |
| [`PRIVACY.md`](./PRIVACY.md) | Privacy policy for the Chrome extension (required for Web Store). |
| [`SPIKE.md`](./SPIKE.md) | OCR-feasibility spike notes. |

## How the data flows

```
   110kc3/przetargimiejskie  ──>  data/gliwice/*.json  ──>  raw.githubusercontent.com  ──>  extension
   (scrape + OCR + parse,         (this repo, mirrored      (background.js fetches it,
    the canonical pipeline)        by the sync script)        6h cache)
```

The Gliwice data format (`schema_version: 1`) is produced by przetargimiejskie's parser. Each active listing now carries a `round` field, and historical listings can have outcomes `sold` / `unsold` / `active` / `announced` / `archived`. The extension reads all of these.

## Syncing the data

```bash
# pull the latest Gliwice data from przetargimiejskie into data/gliwice/
node scripts/sync-from-przetargimiejskie.mjs
```

Override the upstream when testing a fork/branch:

```bash
SOURCE_REPO=youruser/przetargimiejskie SOURCE_BRANCH=dev node scripts/sync-from-przetargimiejskie.mjs
```

## Running on GitHub Actions

The included workflow `.github/workflows/refresh.yml` runs every Monday at 07:00 UTC (an hour after upstream refreshes), plus on demand via the "Run workflow" button. It:

1. Runs `node scripts/sync-from-przetargimiejskie.mjs`.
2. Commits and pushes `data/` if it changed.

The auto-provided `GITHUB_TOKEN` with `permissions: contents: write` is enough; no secrets needed.

If you branch-protect `main`, switch the workflow to open a PR via `peter-evans/create-pull-request` instead of pushing directly.

## Chrome extension

Lives in [`extension/`](./extension). MV3, no build step, no dependencies. Load as unpacked:

1. Open `chrome://extensions`, toggle **Developer mode** on (top right).
2. Click **Load unpacked**, point it at this repo's `extension/` directory.
3. Visit any page under `zgm-gliwice.pl/`.

What it does:

- **Background service worker** (`background.js`) fetches `data/gliwice/{properties,active,meta}.json` from `raw.githubusercontent.com/110kc3/zgm-gliwice/main/data/gliwice/` and caches them in `chrome.storage.local` with a 6-hour TTL. The popup has a **Refresh data** button to bypass the TTL.
- **Content script** (`content.js`) runs on `zgm-gliwice.pl`:
  - On listing index pages (mieszkalne / garaże / użytkowe / wykaz): adds a small color-coded badge to each Elementor card — green for first-time listings, gray for "previously sold" repeats, amber for one prior unsold attempt, red for ≥2 unsold attempts. Hover for a tooltip with the full prior-attempt table.
  - On property-detail pages (the slug-style `/zygmunta-starego-29-4-23-03-2026-r/` URLs): injects a sidebar near the top of the page with a chronological history table (date · round · kind · start price · outcome · final · reason · source PDF) and a price-delta summary versus the first historical attempt.
- **Popup** (`popup.html` + `popup.js`) lists all currently-active properties, sortable by date / asking price / zł/m² / prior-attempt count (click a column header), defaulting to most-relisted first. A **watching** section at the top tracks starred properties. Click a row → opens that property's detail page on `zgm-gliwice.pl`. The footer shows when the cached data was last refreshed and the build version.
- **Archive** (`archive.html`) is a full-page sortable/filterable table of all historical records with median sale-price / zł/m² summary tiles.
- **Dark / light theme.** A ☀ / ☾ toggle in the popup and archive headers; follows the system `prefers-color-scheme` by default and persists an explicit override across tabs.
- **Language: PL / EN.** The popup has a small `PL` / `EN` button in the header. Default is PL (since the source data is Polish municipal records). Toggle is persisted in `chrome.storage.local` and broadcast across tabs — flipping it in the popup retranslates open zgm-gliwice.pl tabs in place, no reload required. All user-facing strings live in [`extension/i18n.js`](./extension/i18n.js).

**Address-key parity** — the extension's `normalize.js` and the pipeline's `normalize.js` produce identical `street_norm|building|apt` join keys. This is verified end-to-end against live data: every active listing in `active.json` round-trips from page-title → parsed address → matching property key in `properties.json`.

**Detail-page address detection** — the page `<title>` is preferred over the URL slug because slug encoding is ambiguous on digit collisions (e.g. `/krolewskiej-tamy-5-2-...` could be either `5/2` or `53/2`); the title carries the canonical address.


### Privacy policy

See [PRIVACY.md](./PRIVACY.md). The short version: nothing leaves your computer. The extension fetches three public JSON files from GitHub and reads pages you're already viewing on `zgm-gliwice.pl` — that's the entire network footprint. No analytics, no tracking, no third-party services. For Chrome Web Store submission, link to the GitHub-hosted raw URL: `https://github.com/110kc3/zgm-gliwice/blob/main/PRIVACY.md`.

### Roadmap

- Icons (manifest currently has no `icons` entry — Chrome will fall back to a default).
- Optional CI step: validate the extension's address parser against current `data/` as part of `.github/workflows/refresh.yml`.

## Current coverage (data quality notes)

- **162+ unique properties** tracked from 43 historical result PDFs going back to **2024-02-12**.
- **~95–97% of records** in each PDF parse cleanly. The remaining ~3% are real edge cases the parser intentionally drops:
  - Properties identified only by internal building ID (`Kłodnicka (ID budynku nr 2155)`).
  - Garage units with no building number (`Ziębia`, `garażu nr 12 na płd. wsch. od ul. Daszyńskiego 95-97`).
- OCR-introduced quirks that *are* corrected and flagged in `notes`:
  - `1I` → `1` (slash eaten by OCR).
  - `TII` → `III` (T misread for I).
  - `105:400,00` → `105400` (colon mistaken for period in prices).
- Roman-numeral apartment numbers are preserved as-is (`Barlickiego 12/I`), which matches Polish municipal convention.

## Attribution

All scraped data originates from [zgm-gliwice.pl](https://zgm-gliwice.pl/), the public site of Zakład Gospodarki Mieszkaniowej Gliwice. This repository is a read-only mirror with a derived view; canonical sources for any data point are linked from each `listings[].source_pdf` field.
