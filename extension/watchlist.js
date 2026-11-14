
(function () {
  const STORAGE_KEY = 'watchlist';
  const listeners = new Set();

  async function getAll() {
    try {
      const v = await chrome.storage.local.get(STORAGE_KEY);
      return v[STORAGE_KEY] || {};
    } catch {
      return {};
    }
  }

  async function isWatched(key) {
    const all = await getAll();
    return Object.prototype.hasOwnProperty.call(all, key);
  }

  async function watch(key, meta) {
    const all = await getAll();
    if (all[key]) return;
    all[key] = {
      addr: meta?.addr || key,
      kind: meta?.kind || 'unknown',
      detail_url: meta?.detail_url || null,
      city: meta?.city || null,
      added_at: Date.now(),
      last_seen_active: null,
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  }

  async function unwatch(key) {
    const all = await getAll();
    if (!all[key]) return;
    delete all[key];
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  }

  async function markSeenActive(key, fingerprint) {
    const all = await getAll();
    if (!all[key]) return;
    all[key].last_seen_active = fingerprint;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      for (const fn of listeners) {
        try { fn(changes[STORAGE_KEY].newValue || {}); } catch {}
      }
    });
  } catch {}

  // (globalThis) so background.js can import without bundling.
  const api = { getAll, isWatched, watch, unwatch, markSeenActive, onChange };
  if (typeof window !== 'undefined') window.ZGM_WATCH = api;
  if (typeof globalThis !== 'undefined') globalThis.ZGM_WATCH = api;
})();
