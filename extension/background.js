// Service worker:
//   - fetches per-city data/<city>/{properties,active,meta}.json from GitHub
//     for every city in CITIES, merges them into a single payload the popup
//     consumes as a flat list (with each record city-tagged + key-namespaced)
//   - chrome.alarms periodic check: re-fetches, diffs merged active.json
//     against the user's watchlist, and fires chrome.notifications for any
//     newly-active watched property
//   - notification click → opens the property detail page
//
// Multi-city note: the pipeline's data files keep their original
// `street|building|apt` keys; namespacing to `city|street|building|apt` happens
// here at merge time so the extension can mix cities without collisions. A
// one-shot migration upgrades any legacy un-namespaced watchlist entries.

// The watchlist module exposes globalThis.ZGM_WATCH when imported below.
importScripts('watchlist.js');

const REPO = '110kc3/zgm-gliwice';
const BRANCH = 'main';
// Wave 1 popup scope: hardcode the city list. A future Wave 2 will lazily
// fetch only the city matching the active tab's hostname.
const CITIES = ['gliwice'];
const RAW = (city) =>
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/data/${city}`;
const TTL_MS = 6 * 60 * 60 * 1000;       // 6h soft TTL for ad-hoc reads
const ALARM_NAME = 'zgm-watchlist-check';
const ALARM_INTERVAL_MIN = 240;          // 4h periodic watchlist scan

// The merged-cache key embeds the schema version + the city set, so an old
// cached merge from a previous build (e.g. before a city was added) is never
// read back — adding/removing a city automatically invalidates the cache. Bump
// `cacheSchema` only when the payload SHAPE changes.
const CACHE_SCHEMA = 2;
const KEYS = {
  merged: `cache:v${CACHE_SCHEMA}:${[...CITIES].sort().join('+')}:merged`,
};
const MIGRATION_FLAG = 'watchlist:migrated_v2';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function loadFromCache(key) {
  const v = await chrome.storage.local.get(key);
  return v[key];
}

async function saveToCache(key, payload) {
  await chrome.storage.local.set({ [key]: payload });
}

// ---------------- merging ----------------

function nsKey(city, key) {
  if (!key) return key;
  // Already namespaced (looks like "<city>|...") — leave as-is.
  if (key.startsWith(`${city}|`)) return key;
  return `${city}|${key}`;
}

// Mutates each property to (a) prefix `key` with its city and (b) carry a
// `city` field. Returns the same array for chaining.
function namespaceProperties(properties, city) {
  for (const p of properties) {
    p.key = nsKey(city, p.key);
    p.city = city;
  }
  return properties;
}

function namespaceActiveListings(listings, city) {
  for (const l of listings) {
    if (l.address && l.address.key) {
      l.address.key = nsKey(city, l.address.key);
    }
    l.city = city;
  }
  return listings;
}

// Builds the merged payload the popup/archive consume. Each city contributes
// its own three JSONs; key namespacing happens here.
function mergeCityPayloads(cityPayloads) {
  const allProperties = [];
  const allActive = [];
  const allWykaz = [];
  const perCityMeta = {};
  let totalSourcePdfs = 0;
  let totalUnique = 0;
  let totalActive = 0;
  let totalWykaz = 0;
  let latestGenerated = null;

  for (const { city, properties, active, meta } of cityPayloads) {
    const props = properties?.properties || [];
    namespaceProperties(props, city);
    allProperties.push(...props);

    const listings = active?.listings || [];
    namespaceActiveListings(listings, city);
    allActive.push(...listings);

    const wykaz = active?.wykaz || [];
    for (const w of wykaz) w.city = city;
    allWykaz.push(...wykaz);

    perCityMeta[city] = meta || null;
    totalSourcePdfs += meta?.source_pdf_count || 0;
    totalUnique += meta?.unique_properties || props.length;
    totalActive += meta?.active_listings || listings.length;
    totalWykaz += meta?.wykaz_entries || wykaz.length;
    if (meta?.generated_at) {
      if (!latestGenerated || meta.generated_at > latestGenerated) {
        latestGenerated = meta.generated_at;
      }
    }
  }

  // Mirror the legacy shape the popup/archive already expect:
  //   payload.properties.properties = [...]
  //   payload.active.listings       = [...]
  //   payload.active.wykaz          = [...]
  //   payload.meta                  = { ...aggregates, per_city }
  return {
    properties: {
      schema_version: 1,
      properties: allProperties,
    },
    active: {
      schema_version: 1,
      listings: allActive,
      wykaz: allWykaz,
    },
    meta: {
      schema_version: 1,
      generated_at: latestGenerated,
      source_pdf_count: totalSourcePdfs,
      unique_properties: totalUnique,
      active_listings: totalActive,
      wykaz_entries: totalWykaz,
      cities: CITIES,
      per_city: perCityMeta,
    },
  };
}

async function fetchCity(city) {
  const base = RAW(city);
  try {
    const [properties, active, meta] = await Promise.all([
      fetchJson(`${base}/properties.json`),
      fetchJson(`${base}/active.json`),
      fetchJson(`${base}/meta.json`),
    ]);
    return { city, properties, active, meta };
  } catch (err) {
    // A city whose data isn't published yet (e.g. just added to CITIES, not yet
    // pushed) must NOT blank the whole extension. Skip it; the others still load.
    console.warn(`[ZGM ext] skipping city "${city}": ${err.message}`);
    return null;
  }
}

async function getOrFetch(force = false) {
  const now = Date.now();
  const cached = await loadFromCache(KEYS.merged);
  if (!force && cached && now - cached.fetched_at < TTL_MS) {
    return {
      properties: cached.data.properties,
      active: cached.data.active,
      meta: cached.data.meta,
      fetched_at: cached.fetched_at,
    };
  }
  const cityPayloads = (await Promise.all(CITIES.map((c) => fetchCity(c)))).filter(Boolean);
  const merged = mergeCityPayloads(cityPayloads);
  const fetched_at = Date.now();
  await saveToCache(KEYS.merged, { data: merged, fetched_at });
  return { ...merged, fetched_at };
}

// ---------------- watchlist migration ----------------

// One-shot upgrade for keys saved by the pre-merge extension. Legacy keys
// look like "street|building|apt" (2 pipes); namespaced keys look like
// "city|street|building|apt" (3 pipes). Anything with <3 pipes is assumed to
// be a Gliwice entry (the only city that existed when those keys were saved).
async function migrateWatchlistOnce() {
  try {
    const flag = (await chrome.storage.local.get(MIGRATION_FLAG))[MIGRATION_FLAG];
    if (flag) return;
    const all = await ZGM_WATCH.getAll();
    let changed = false;
    const next = {};
    for (const [key, entry] of Object.entries(all)) {
      const pipes = (key.match(/\|/g) || []).length;
      if (pipes < 3) {
        const newKey = `gliwice|${key}`;
        next[newKey] = entry;
        changed = true;
      } else {
        next[key] = entry;
      }
    }
    if (changed) {
      await chrome.storage.local.set({ watchlist: next });
    }
    await chrome.storage.local.set({ [MIGRATION_FLAG]: true });
  } catch (err) {
    console.warn('[ZGM bg] watchlist migration skipped:', err);
  }
}

// ---------------- watchlist diff + notifications ----------------

function activeFingerprint(listing) {
  return {
    auction_date: listing.auction_date,
    starting_price_pln: listing.starting_price_pln,
  };
}

function sameFingerprint(a, b) {
  if (!a || !b) return false;
  return (
    a.auction_date === b.auction_date &&
    a.starting_price_pln === b.starting_price_pln
  );
}

function fmtPLN(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) + ' zł';
}

async function notifyNewListing(key, entry, listing) {
  const id = `zgm-watch-${key}-${listing.auction_date || 'now'}`;
  const reg = (await chrome.storage.local.get('notif:registry'))['notif:registry'] || {};
  reg[id] = entry.detail_url || `https://zgm-gliwice.pl/`;
  await chrome.storage.local.set({ 'notif:registry': reg });

  // PL strings (the app's default). City prefix helps disambiguate now that
  // notifications can fire for any of CITIES.
  const cityLabel = entry.city ? ` [${entry.city}]` : '';
  const title = `przetargimiejskie${cityLabel} — nowa aukcja obserwowanej nieruchomości`;
  const body = `${entry.addr} — aukcja ${listing.auction_date || '?'} po ${fmtPLN(listing.starting_price_pln)}`;
  await chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title,
    message: body,
    priority: 2,
  });
}

async function runWatchlistCheck() {
  await migrateWatchlistOnce();
  let payload;
  try {
    payload = await getOrFetch(true);
  } catch (err) {
    console.warn('[ZGM bg] watchlist check skipped — fetch failed:', err);
    return;
  }
  const watchlist = await ZGM_WATCH.getAll();
  if (Object.keys(watchlist).length === 0) return;

  const propsByKey = new Map(
    (payload.properties?.properties || []).map((p) => [p.key, p]),
  );

  for (const [key, entry] of Object.entries(watchlist)) {
    const prop = propsByKey.get(key);
    const active = prop?.listings.find((l) => l.outcome === 'active');
    if (!active) {
      if (entry.last_seen_active) {
        await ZGM_WATCH.markSeenActive(key, null);
      }
      continue;
    }
    const fp = activeFingerprint({
      auction_date: active.date,
      starting_price_pln: active.starting_price_pln,
    });
    if (sameFingerprint(fp, entry.last_seen_active)) continue;
    await notifyNewListing(key, entry, {
      auction_date: active.date,
      starting_price_pln: active.starting_price_pln,
    });
    await ZGM_WATCH.markSeenActive(key, fp);
  }
}

// ---------------- alarms wiring ----------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_INTERVAL_MIN });
  // Best-effort migration on upgrade so legacy watchlist keys don't silently
  // stop matching once the merge starts namespacing.
  migrateWatchlistOnce().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_INTERVAL_MIN });
  migrateWatchlistOnce().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runWatchlistCheck().catch((err) =>
      console.warn('[ZGM bg] watchlist check error:', err),
    );
  }
});

// ---------------- notification click → open detail page ----------------

chrome.notifications.onClicked.addListener(async (id) => {
  const reg = (await chrome.storage.local.get('notif:registry'))['notif:registry'] || {};
  const url = reg[id];
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(id);
  delete reg[id];
  await chrome.storage.local.set({ 'notif:registry': reg });
});

// ---------------- message handlers ----------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'getData') {
    (async () => {
      try {
        await migrateWatchlistOnce();
        const payload = await getOrFetch(Boolean(msg.force));
        sendResponse({ ok: true, payload });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }
  if (msg?.type === 'runWatchlistCheck') {
    runWatchlistCheck()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
