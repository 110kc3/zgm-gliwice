# Changelog

## v2.0.0 — 2026-06-09

Major rework. ZGM Gliwice is now a thin, Gliwice-only consumer of the
[przetargimiejskie](https://github.com/110kc3/przetargimiejskie) pipeline,
with the new-standard extension UI.

- **Data source:** removed this repo's own scraper/OCR pipeline. Gliwice data
  is now mirrored from przetargimiejskie's published `data/gliwice/` via
  `scripts/sync-from-przetargimiejskie.mjs`. The extension still serves it from
  this repo's `raw.githubusercontent.com` URL, now under `data/gliwice/`.
- **New pipeline format:** active listings carry a `round` field; historical
  listings support `sold` / `unsold` / `active` / `announced` / `archived`
  outcomes. The extension reads all of these.
- **UI — new standard:** dark/light theme toggle (`theme.js`), sortable popup
  columns, a `From year` history filter (`settings.js`), and refreshed
  popup/archive styling with CSS-variable theming. The per-city chip is
  suppressed in this single-city build.
- **Architecture:** content script now uses the `sites/` adapter registry
  (`sites/registry.js` + `sites/gliwice.js`) instead of hard-coded DOM logic.
  Background service worker namespaces property keys as `gliwice|…` and
  migrates legacy watchlist entries.
- **CI:** `.github/workflows/refresh.yml` replaced the OCR build with a fast
  data-sync job.

## v1.0.0

Initial release: local scrape + OCR + parse pipeline, single-city Gliwice
Chrome extension with PL/EN popup, content-script badges, and watchlist
notifications.
