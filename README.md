# ZGM Gliwice Auction History

A Chrome extension (Manifest V3) that injects auction price history and relisting trends directly onto ZGM Gliwice municipal property listings.

- **Listing overlays:** Highlights previously unsold properties, price cuts, and full prior auction history on `zgm-gliwice.pl`.
- **Active auctions popup:** Sortable active listings, personal watchlist, and full historical property archive.
- **Serverless data pipeline:** Lightweight static JSON data mirrored from `przetargimiejskie` with no external telemetry or backend requirements.
- **Documentation:** [`PLAN.md`](PLAN.md) · [`PRIVACY.md`](PRIVACY.md) · [`CHANGELOG.md`](CHANGELOG.md)

## Quick Start

```bash
# Run unit tests
node --test test/normalize.test.mjs

# Sync latest municipal auction data
node scripts/sync-from-przetargimiejskie.mjs
```

Override the upstream with `SOURCE_REPO=owner/repo SOURCE_BRANCH=branch` when testing a fork.

To use the extension, open `chrome://extensions`, enable **Developer mode**, and load the [`extension/`](extension/) directory unpacked.
