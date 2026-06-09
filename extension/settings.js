// Lightweight per-user settings persisted to chrome.storage.local. Currently
// holds one setting: minHistoryYear — the cutoff used by the archive, the
// content-script's prior-history tooltips and the detail-page panel to hide
// older sold/unsold records.
//
// Default = current_year - 3 (3 years of history); the pipeline applies its
// own broader floor (see pipeline/src/refresh.js PIPELINE_MIN_HISTORY_YEAR),
// so the UI can never reveal records the pipeline already dropped.
//
// API exposed on window.ZGM_SETTINGS (and globalThis.ZGM_SETTINGS for the SW):
//   getMinHistoryYear()        → number
//   setMinHistoryYear(year)    → Promise<void>     persist + broadcast
//   minYearOptions()           → number[]          sensible dropdown values
//   onChange(fn)               → unsubscribe()
//   ready                      → Promise           resolves after first read

(function () {
  const KEY = 'minHistoryYear';
  const NOW_YEAR = new Date().getFullYear();
  const DEFAULT_FLOOR = NOW_YEAR - 3;
  const ABSOLUTE_MIN = 2000;
  const listeners = new Set();
  let _val = DEFAULT_FLOOR;

  function isValidYear(n) {
    return Number.isFinite(n) && n >= ABSOLUTE_MIN && n <= NOW_YEAR + 1;
  }

  const ready = (async () => {
    try {
      const v = await chrome.storage.local.get(KEY);
      const n = Number(v[KEY]);
      if (isValidYear(n)) _val = n;
    } catch {}
  })();

  function getMinHistoryYear() {
    return _val;
  }

  async function setMinHistoryYear(year) {
    const n = Number(year);
    if (!isValidYear(n)) return;
    _val = n;
    try {
      await chrome.storage.local.set({ [KEY]: n });
    } catch {}
    for (const fn of listeners) {
      try { fn(n); } catch {}
    }
  }

  // Dropdown options for any UI control. Covers the typical "last N years"
  // range; bounded by the broader pipeline floor (PIPELINE_MIN_HISTORY_YEAR
  // is 2020 today). If the pipeline floor ever moves, widen this list to
  // match — the extension can't render what isn't shipped.
  function minYearOptions() {
    const earliest = Math.min(2020, DEFAULT_FLOOR);
    const out = [];
    for (let y = NOW_YEAR; y >= earliest; y--) out.push(y);
    return out;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Cross-tab sync.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY]) return;
      const next = Number(changes[KEY].newValue);
      if (isValidYear(next) && next !== _val) {
        _val = next;
        for (const fn of listeners) {
          try { fn(next); } catch {}
        }
      }
    });
  } catch {}

  const api = { getMinHistoryYear, setMinHistoryYear, minYearOptions, onChange, ready };
  if (typeof window !== 'undefined') window.ZGM_SETTINGS = api;
  if (typeof globalThis !== 'undefined') globalThis.ZGM_SETTINGS = api;
})();
