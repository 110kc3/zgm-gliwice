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
