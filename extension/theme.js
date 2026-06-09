// Theme manager. Two explicit states + auto:
//   - No stored value → follow prefers-color-scheme (auto, default)
//   - Stored 'light' or 'dark' → explicit override, persists across sessions
//
// Applied via [data-theme="light"|"dark"] on <html>. CSS layers this on top
// of its @media (prefers-color-scheme: dark) block so:
//   • system dark, no override   → dark (from @media)
//   • system light, no override  → light (defaults)
//   • data-theme="dark"          → dark (overrides @media if light)
//   • data-theme="light"         → light (the @media rule excludes this)
//
// API exposed on window.ZGM_THEME:
//   getEffective()   → 'light' | 'dark'  (what's currently rendered)
//   getExplicit()    → 'light' | 'dark' | null
//   setExplicit(t)   → persist + apply + notify
//   toggle()         → flip effective theme, persist as explicit
//   onChange(fn)     → fn(effective)
//   ready            → Promise resolved after initial storage read

(function () {
  const STORAGE_KEY = 'theme';
  const listeners = new Set();
  let _explicit = null; // null | 'light' | 'dark'

  const mql =
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-color-scheme: dark)')
      : null;

  function effective() {
    if (_explicit === 'light' || _explicit === 'dark') return _explicit;
    return mql && mql.matches ? 'dark' : 'light';
  }

  function apply() {
    const el = document.documentElement;
    if (_explicit) el.setAttribute('data-theme', _explicit);
    else el.removeAttribute('data-theme');
    const eff = effective();
    for (const fn of listeners) {
      try { fn(eff); } catch {}
    }
  }

  async function setExplicit(theme) {
    if (theme !== 'light' && theme !== 'dark') return;
    _explicit = theme;
    try { await chrome.storage.local.set({ [STORAGE_KEY]: theme }); } catch {}
    apply();
  }

  async function toggle() {
    const next = effective() === 'dark' ? 'light' : 'dark';
    await setExplicit(next);
  }

  function getEffective() { return effective(); }
  function getExplicit() { return _explicit; }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Re-fire onChange when the system pref flips, but only when no explicit
  // override is in effect (matches the @media rule's exclusion logic).
  if (mql && mql.addEventListener) {
    mql.addEventListener('change', () => {
      if (!_explicit) {
        const eff = effective();
        for (const fn of listeners) { try { fn(eff); } catch {} }
      }
    });
  }

  // Initial load.
  const ready = (async () => {
    try {
      const v = await chrome.storage.local.get(STORAGE_KEY);
      if (v[STORAGE_KEY] === 'light' || v[STORAGE_KEY] === 'dark') {
        _explicit = v[STORAGE_KEY];
      }
    } catch {}
    apply();
  })();

  // Cross-window sync: a toggle in the popup updates the archive tab and
  // vice versa via the storage-change event.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      _explicit = next === 'light' || next === 'dark' ? next : null;
      apply();
    });
  } catch {}

  window.ZGM_THEME = {
    getEffective,
    getExplicit,
    setExplicit,
    toggle,
    onChange,
    ready,
  };
})();
