
(function () {
  const STORAGE_KEY = 'theme';
  const listeners = new Set();
  let _explicit = null;

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

  if (mql && mql.addEventListener) {
    mql.addEventListener('change', () => {
      if (!_explicit) {
        const eff = effective();
        for (const fn of listeners) { try { fn(eff); } catch {} }
      }
    });
  }

  const ready = (async () => {
    try {
      const v = await chrome.storage.local.get(STORAGE_KEY);
      if (v[STORAGE_KEY] === 'light' || v[STORAGE_KEY] === 'dark') {
        _explicit = v[STORAGE_KEY];
      }
    } catch {}
    apply();
  })();

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
