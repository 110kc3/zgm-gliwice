# ZGM Gliwice auction tracker — plan

> **Status:** revised after the [OCR spike](computer://C:\Users\K\repos\zgm-gliwice/SPIKE.md). OCR confirmed working with local tesseract; switching the recommendation from "scraper + static report" to **"local pipeline → GitHub-hosted JSON → Chrome extension"** based on the user's preference not to host anything.

## Hard requirements (user-stated)

- **Primary goal:** when looking at any active auction listing, I want to immediately see whether this property has been listed before, **how many times**, **at what prices**, and **on what dates** — i.e. full price-history per property, not just a "repeat" flag.
- **No hosting.** No server, no paid service. Free static hosting only.
- **Acceptable workflow:** I run the OCR / parsing locally (or via GitHub Actions), commit the resulting JSON to a public GitHub repo, and a Chrome extension pulls it from `raw.githubusercontent.com` when I browse the ZGM site.
- Dataset is small (~43 historical PDFs total, a handful added per month) so we're not worried about file size, CDN rate limits, or background refresh.

## What I found out from poking at the site

- **Active listings** (`/przetargi-lokale-mieszkalne/`, `/przetargi-garaze/`, `/przetargi-lokale-uzytkowe/`):
  HTML cards. Each card already shows address (e.g. `Zygmunta Starego 29/4`), auction date, area in m², and starting price in PLN. Following the card link leads to a per-property HTML detail page. **Scraping is trivial.**
- **"Wykaz" page** (`/wykaz-lokali-przeznaczonych-do-sprzedazy-w-przetargu/`): also HTML, structurally similar.
- **Results** (`/wyniki-przetargow/`, 2 pages of listings, ~43 entries total going back to **Feb 2024**): each entry is just a **link to a PDF**. The PDFs (e.g. `04.05.2026-r.-wyniki-przetargow.pdf`) are **scanned images** — each page is a single JPEG. `pdftotext` returns 0 bytes. **OCR is required to extract any data.** This is the dominant cost in the project.

So the matching pipeline looks like:

```
active HTML  ──┐
wykaz HTML   ──┼──>  normalize "street + apt"  ──>  join  ──>  flag repeats
result PDFs ───┘                                              + show price history
   (OCR)
```

The "address + apt" matching key you picked is fine for active/wykaz (they already show `Zygmunta Starego 29/4` in plain text). For results PDFs it depends on what OCR pulls out; we'll need a normalization step (lowercase, strip diacritics, collapse "ul. ", standardize the `/` between street-number and apt-number).

## Revised recommendation: **local pipeline → GitHub-hosted JSON → Chrome extension**

This is the same hard work as before, just with the data plane swapped from "static HTML report on disk" to "JSON committed to a GitHub repo, fetched by an extension." No server. No hosting bill. The split is:

```
┌─────────── runs locally (or via GitHub Actions) ────────────┐    ┌──── runs in browser ────┐
fetch result PDFs ─> tesseract -l pol ─> regex parse ─> JSON  ─git push─> raw.githubusercontent
                                                                                  │
                                                                                  ▼
                                                              Chrome extension fetches JSON,
                                                              annotates ZGM pages inline
```

Why this works:

1. **OCR happens once, ahead of time.** The Chrome extension never sees a PDF. It just downloads a small JSON file (~tens of KB for the full history) on install / on demand. So all the Tesseract-in-the-browser problems from the earlier comparison disappear.
2. **GitHub raw URLs are free, CORS-friendly, CDN-backed.** `https://raw.githubusercontent.com/<you>/<repo>/main/data/results.json` is fetchable from any extension with no auth, no rate-limit issues at this scale, no infrastructure to maintain.
3. **The pipeline is content-addressable and idempotent.** Each result PDF's URL contains the date; once parsed, its JSON never changes. Re-runs only do work for newly-published PDFs.
4. **You stay in control of the data.** Want to hand-fix an OCR mistake? Edit the JSON in the repo and commit. The extension picks it up on next fetch.
5. **GitHub Actions can run the pipeline weekly** for free on a public repo — apt-get tesseract + tesseract-ocr-pol, run the script, commit if anything changed. Zero infra.

## What the Chrome extension specifically shows

Per the hard requirement, the extension needs to surface previous listings + prices + dates. Concretely:

**On listing index pages** (`/przetargi-lokale-mieszkalne/`, `/przetargi-garaze/`, `/przetargi-lokale-uzytkowe/`, `/wykaz-...`):

- Scan each card for its address.
- For each address with history, inject a small badge: `prev: 2× unsold, 1× sold` and a color band (green = no history / first listing, yellow = 1 prior failure, red = ≥2 prior failures).
- Hover → tooltip with the full timeline.

**On a specific property page** (`/zygmunta-starego-29-4-23-03-2026-r/` style URLs):

- Inject a sidebar/panel: a chronological table of all prior attempts.
- Columns: **date · auction round (I/II/III/IV) · type · starting price · outcome · final price · reason if unsold**.
- Show price-history sparkline for the starting price across attempts.
- Show delta to current asking price ("current ask is X% below first attempt N years ago").

**Anywhere on the site**, an extension popup with:

- A list of all currently-active listings, sorted by "most-relisted" first — answers "where's the low-interest stuff" in one click.
- "Last data refresh: 3 days ago. [Refresh now]" button that re-fetches the JSON.

## Why this is better than what I originally recommended

The earlier "Node.js + SQLite + static HTML report" plan was tuned to avoid the OCR-in-the-browser trap. But it solved that trap by giving up the inline overlay — the very thing that makes this useful in real life. The GitHub-JSON split keeps the OCR off the browser **and** gives you the overlay. The cost is writing a small Chrome extension, which is genuinely small once the JSON shape is fixed.

## Form-factor comparison (revised)

### Option A — local pipeline → GitHub-hosted JSON → Chrome extension  *(recommended)*

**+** Zero hosting cost. GitHub repo + raw.githubusercontent.com is the entire backend.
**+** OCR is straightforward (`pdftoppm` + `tesseract -l pol`, runs on your laptop or in GitHub Actions).
**+** Idempotent, cache-friendly: each PDF parsed once and committed; re-runs only handle new ones; diffs are reviewable in git.
**+** Inline overlay UX you actually wanted — annotations show up as you browse the ZGM site.
**+** You stay in control: hand-edit the JSON in the repo if OCR ever misreads a number, commit, done.
**+** GitHub Actions can run the pipeline on a weekly cron for free on a public repo.
**−** Two pieces to build: the Node pipeline AND a small Chrome extension. (Both are small; the parser is the only really fiddly part.)
**−** Chrome extension packaging — installing as unpacked / sideloading is fine for one user, Web Store has a one-time $5 dev fee if you ever want to publish.

### Option B — local pipeline only, with a static HTML report (the original Option A)

**+** Slightly less work — no extension at all.
**+** Single HTML file you can open from anywhere; good for ad-hoc exploration ("show me all unsold ≥2× sorted by area").
**−** Misses the user's stated goal: you only see context if you remember to open the report. The whole point is to surface "this has been unsold 3×" *at the moment you're looking at the active listing*.

### Option C — Chrome extension doing OCR in-browser (no GitHub)

**+** Truly self-contained, no external repo to keep.
**−** Tesseract.js in a service worker is slow (~10–30s per PDF page), ships ~10MB+ of WASM, and even after all that you still have to keep the parsed history somewhere — `chrome.storage.local` has size limits and isn't great for "I want to look at this on my other laptop too."
**−** Re-parses the same PDFs repeatedly across machines for no reason.
**−** Manifest v3 background work limits make scheduled refresh painful.

### Option D — Cowork live artifact (HTML page in this app)

**+** Zero packaging; "Reload" re-runs the pipeline via the workspace shell.
**+** Can call `askClaude(...)` for cheap natural-language summaries.
**−** Not portable — only viewable inside this app, on this device.
**−** Same as B: no inline overlay on the ZGM site itself.

## Proposed architecture for Option A

```
zgm-gliwice/
├── pipeline/                         # the local / CI side
│   ├── src/
│   │   ├── crawlActive.ts            # GET active + wykaz HTML pages → active.json
│   │   ├── crawlResults.ts           # GET /wyniki-przetargow/page/* → list of PDF URLs
│   │   ├── ocrPdf.ts                 # pdftoppm + tesseract -l pol → raw text per page (cached)
│   │   ├── parseResult.ts            # raw text → structured per-auction records
│   │   ├── normalize.ts              # "ul. Zygmunta Starego 29/4" → {street:"zygmunta starego", num:"29", apt:"4"}
│   │   └── build.ts                  # merge everything → data/properties.json
│   ├── ocr-cache/                    # one .txt per PDF URL hash, committed (cheap, debuggable)
│   └── package.json
├── data/                             # ← THE PUBLIC API the extension reads
│   ├── properties.json               # one entry per unique property, with full history
│   ├── active.json                   # snapshot of current/wykaz listings (refreshed weekly)
│   └── meta.json                     # {generated_at, pipeline_version, source_pdfs:[...]}
├── extension/                        # the Chrome side
│   ├── manifest.json                 # MV3, host_permissions: ["https://zgm-gliwice.pl/*"]
│   ├── background.js                 # fetch+cache properties.json from raw.githubusercontent
│   ├── content.js                    # inject overlay on listing index + property detail pages
│   ├── popup.html / popup.js         # "all active, sorted by most-relisted"
│   └── styles.css
├── .github/workflows/refresh.yml     # weekly cron: run pipeline, commit data/* if changed
└── README.md
```

### Data shape committed to `data/properties.json`

Sketch — single source of truth the extension consumes:

```json
{
  "schema_version": 1,
  "properties": [
    {
      "key": "zygmunta-starego-29/4",
      "street": "Zygmunta Starego",
      "building": "29",
      "apt": "4",
      "kind": "mieszkalny",
      "area_m2": 86.79,
      "listings": [
        {
          "date": "2025-09-15",
          "round": 1,
          "starting_price_pln": 478500,
          "outcome": "unsold",
          "unsold_reason": "no_deposits",
          "final_price_pln": null,
          "source_pdf": "https://zgm-gliwice.pl/wp-content/uploads/2025/09/15.09.2025-r.-wyniki-przetargow.pdf"
        },
        {
          "date": "2026-01-20",
          "round": 2,
          "starting_price_pln": 461430,
          "outcome": "unsold",
          "unsold_reason": "bidder_withdrew",
          "final_price_pln": null,
          "source_pdf": "https://zgm-gliwice.pl/wp-content/uploads/2026/01/20.01.2026-r.-wyniki-przetargow.pdf"
        },
        {
          "date": "2026-06-22",
          "round": 3,
          "starting_price_pln": 461430,
          "outcome": "active",
          "source_url": "https://zgm-gliwice.pl/zygmunta-starego-29-4-23-03-2026-r/"
        }
      ]
    }
  ]
}
```

The "show previous listings + prices + dates" view is then trivial extension-side: look up `properties[key].listings`, render the table.

### Why no SQLite anymore

The original plan had SQLite because the report was being generated server-side. With the data flowing through a public JSON file consumed by JS, a single denormalized array is simpler, smaller (probably <100KB total), and easier to diff in git. SQLite would be over-engineering at this scale.

## The GitHub Actions workflow that runs the whole pipeline

This is what makes it fully hands-off after the initial setup. A weekly (or daily) cron triggers a runner that fetches new PDFs, OCRs them, parses them, and commits any deltas back to `data/`. No server, no laptop-must-be-on, no secrets beyond the auto-provided `GITHUB_TOKEN`.

```yaml
# .github/workflows/refresh.yml
name: Refresh auction data

on:
  schedule:
    - cron: '0 6 * * 1'      # Mondays 06:00 UTC. Daily is also fine.
  workflow_dispatch: {}      # adds a "Run workflow" button in the Actions UI

permissions:
  contents: write            # so the auto-token can git push back to main

concurrency:
  group: refresh
  cancel-in-progress: false  # don't have two refreshers racing on the same data

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install OCR toolchain
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y -qq poppler-utils tesseract-ocr tesseract-ocr-pol

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: pipeline/package-lock.json

      - name: Install pipeline deps
        working-directory: pipeline
        run: npm ci

      - name: Run pipeline (fetch new PDFs, OCR, parse, build data/)
        working-directory: pipeline
        run: npm run refresh

      - name: Commit and push if data changed
        run: |
          git config user.name  "zgm-data-bot"
          git config user.email "zgm-data-bot@users.noreply.github.com"
          git add data/ pipeline/ocr-cache/
          if git diff --cached --quiet; then
            echo "No changes."
          else
            git commit -m "data: weekly refresh $(date -u +%Y-%m-%d)"
            git push
          fi
```

What this gives you, in plain terms:

- **Automatic weekly refresh.** Every Monday morning the runner wakes up, checks the ZGM site, downloads any new result PDFs, OCRs them, parses them, and if anything actually changed, commits the new JSON to `main`. The Chrome extension then sees the fresh data on its next fetch.
- **Manual trigger any time.** The `workflow_dispatch: {}` line adds a green "Run workflow" button in the GitHub Actions tab — handy when you spot a new result PDF and don't want to wait for Monday.
- **Self-healing OCR cache.** `pipeline/ocr-cache/<url-hash>.txt` is committed alongside the data, so a fresh runner doesn't redo OCR for the 43 historical PDFs every week — it only OCRs the PDFs it doesn't have a cache entry for.
- **Idempotent pushes.** The `git diff --cached --quiet || …` pattern means weeks with no new auctions produce zero commits. Your git history stays clean.
- **Failure visibility.** GitHub emails you when an Actions job fails by default, so if the ZGM site changes layout or a PDF format drifts, you'll know within a week.

### Gotchas worth knowing about up-front

1. **Cron precision.** GitHub's scheduled workflows can be delayed up to ~15 min under high load. Doesn't matter for weekly data.
2. **Branch protection on `main`.** If you protect `main` with required reviews, the auto-token can't push directly. Options: (a) target a `data` branch instead and auto-merge, (b) skip protection on this repo since it's just data, or (c) have the workflow open a PR via `peter-evans/create-pull-request` and you click merge.
3. **Workflow doesn't trigger other workflows by default.** A commit made by `GITHUB_TOKEN` won't fire `on: push` workflows. Irrelevant here since the extension fetches the file directly, not via webhook.
4. **Tesseract Polish data is ~19 MB.** Installs in <5 sec on `ubuntu-latest` and isn't cached separately, but you can speed up future runs by caching `/var/cache/apt` if it ever matters (it won't at weekly cadence).
5. **The site could ban a noisy User-Agent.** Set a polite UA in the crawler (`User-Agent: zgm-gliwice-archive-bot/0.1 (+https://github.com/<you>/<repo>)`) and add a `await sleep(1000)` between requests. With ~50 fetches per week this is well under any reasonable rate-limit threshold.

So to answer directly: yes, the whole "fetch newest results, convert them, push" loop is exactly one workflow file. You set it up once at the same time you push the initial pipeline code, and after that you only touch the code if a parser bug needs fixing or you want a new view in the extension.

## Open risks worth flagging before any code is written

1. **OCR accuracy on Polish + tables.** ✅ Resolved by the [spike](computer://C:\Users\K\repos\zgm-gliwice/SPIKE.md). Local tesseract is sufficient. Cloud OCR not needed.
2. **Address-matching false negatives.** "ul. Zygmunta Starego 29/4" vs "Zygmunta Starego 29 m. 4" vs "Zygm. Starego 29/4" — pretty common in Polish municipal docs. The normalization step needs a small unit-test suite with real examples once we see what the OCR produces. Spike also revealed one specific gotcha: the slash in `<num>/<apt>` occasionally OCRs as capital-I (e.g. `18/1` → `18/1I`), so the parser needs a tolerant address regex.
3. **"Same auction round, multiple attempts" semantics.** ✅ Resolved by the spike — each result paragraph explicitly carries the round as a Roman numeral (`II ustny przetarg`, `III ustny przetarg`, …) so we can store the round directly without inferring it.
4. **Public repo containing scraped public data.** Polish public-sector auction results are already public, but worth a README note that this repo is read-only mirroring with attribution back to zgm-gliwice.pl. Add a `robots`-friendly throttle (`1 req/sec`) and a real `User-Agent` in the crawler.
5. **Active listings drift faster than results.** Active/wykaz pages can change daily as new auctions are announced. Weekly refresh of `active.json` is probably fine for "see history when browsing", but if you want minute-level freshness the extension could also scrape the visible active-page DOM client-side and merge — only the historical `properties.json` truly needs the pipeline.
6. **Address-to-property-page matching.** The active site uses slugged URLs like `/zygmunta-starego-29-4-23-03-2026-r/`. The extension can derive the address from the URL itself, which makes the on-page lookup easy. Sanity-check this assumption holds across all three categories (mieszkalne, garaże, użytkowe) before relying on it.

## What I'd suggest as next steps (when you say go)

1. ✅ **OCR spike** — done; local tesseract is good enough. See [SPIKE.md](./SPIKE.md).
2. ✅ **Build the pipeline** — done; canonical pipeline moved to [`110kc3/przetargimiejskie`](https://github.com/110kc3/przetargimiejskie) and mirrored via `scripts/sync-from-przetargimiejskie.mjs` into `data/gliwice/`.
3. ✅ **Set up the GitHub repo and Actions workflow** — done; `.github/workflows/refresh.yml` runs weekly at 07:00 UTC Mondays and commits any deltas.
4. ✅ **Build the Chrome extension (MV3)** — done; full extension in `extension/` with content script badges, history tooltips, popup, archive view, and dark/light themes.
5. ✅ **Validate end-to-end** — done; verified data schema, address normalization, and slug parsing in `test/normalize.test.mjs` (11 unit tests pass).
6. *(Optional)* extension badge polish: color-coding, price-delta indicator, sparkline.
