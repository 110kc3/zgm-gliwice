// Popup: watching section (top) + currently-active table (bottom).
// Clicking a star toggles watch; clicking a row opens detail in new tab.

const $status = document.getElementById('status');
const $table = document.getElementById('active-table');
const $tbody = $table.querySelector('tbody');
const $meta = document.getElementById('meta');
const $refresh = document.getElementById('refresh');
const $langToggle = document.getElementById('lang-toggle');
const $themeToggle = document.getElementById('theme-toggle');
const $activeHeading = document.getElementById('active-heading');
const $watchingSection = document.getElementById('watching-section');
const $watchingTbody = $watchingSection.querySelector('tbody');

const t = (k, vars) => window.ZGM_I18N.t(k, vars);
const fmtPLN = (n) =>
  n == null ? '—' : new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) + ' zł';

const roundLabel = (n) => (n ? t('chip.round', { r: String(n) }) : null);

// Background.js namespaces property keys as `<city>|...`, so we can recover
// the city for legacy/orphan watch entries that don't carry one.
function cityFromKey(key) {
  if (!key || typeof key !== 'string') return null;
  const i = key.indexOf('|');
  return i > 0 ? key.slice(0, i) : null;
}

// Compact city chip prepended to the Property cell on each row. Style lives
// in popup.css; color variants come from the city id as a data attribute.
function cityTagHtml(city) {
  // Single-city (Gliwice) build: the chip is redundant, so always suppress it.
  return '';
  // eslint-disable-next-line no-unreachable
  if (!city) return '';
  const label = t('city.' + city);
  // Fall back to a capitalized id when no translation is registered.
  const display = label === 'city.' + city
    ? city.charAt(0).toUpperCase() + city.slice(1)
    : label;
  return `<span class="zgm-city-tag" data-city="${city}">${display}</span> `;
}

function datesCellHtml(a) {
  const rows = [];
  if (a.auction_date) rows.push(`<span class="zgm-date-label">${t('popup.label.auction')}</span> ${a.auction_date}`);
  if (a.wadium_deadline) rows.push(`<span class="zgm-date-label">${t('popup.label.wadium')}</span> ${wadiumCellHtml(a.wadium_deadline)}`);
  if (a.viewing_date) rows.push(`<span class="zgm-date-label">${t('popup.label.viewing')}</span> ${a.viewing_date}`);
  return rows.join('<br>');
}

function wadiumCellHtml(date) {
  if (!date) return '—';
  const today = new Date();
  const target = new Date(date + 'T00:00:00');
  const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return `<span class="zgm-past">${date}</span>`;
  if (daysLeft <= 7) return `<span class="zgm-urgent" title="${daysLeft}d">${date}</span>`;
  return date;
}


function applyStaticI18n() {
  document.documentElement.lang = window.ZGM_I18N.getLang();
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  const cur = window.ZGM_I18N.getLang();
  $langToggle.textContent =
    cur === 'pl' ? t('popup.lang_toggle.to_en') : t('popup.lang_toggle.to_pl');
}

let lastPayload = null;
let lastWatchlist = {};

// Active-table sort state. Null sortKey = use the default heuristic
// (most-relisted first, then prior count, then area) — preserves the
// behaviour the popup had before sortable headers existed.
let activeSortKey = null;
let activeSortDir = 'asc';

// Per-column value extractor. Returns null for "missing" so the sorter
// can park empty cells at the bottom regardless of direction.
function activeSortValue(item, key) {
  const a = item.a;
  switch (key) {
    case 'date': return a.auction_date || null;
    case 'ask':  return a.starting_price_pln ?? null;
    case 'm2':
      return a.area_m2 && a.starting_price_pln
        ? a.starting_price_pln / a.area_m2
        : null;
    case 'prior': return item.prior.length;
    default: return null;
  }
}

function sortActiveItems(items) {
  if (!activeSortKey) {
    return items.sort((x, y) => {
      if (y.unsold.length !== x.unsold.length) return y.unsold.length - x.unsold.length;
      if (y.prior.length !== x.prior.length) return y.prior.length - x.prior.length;
      return (y.a.area_m2 || 0) - (x.a.area_m2 || 0);
    });
  }
  return items.sort((x, y) => {
    const av = activeSortValue(x, activeSortKey);
    const bv = activeSortValue(y, activeSortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return activeSortDir === 'asc' ? cmp : -cmp;
  });
}

async function load(force) {
  $status.hidden = false;
  $status.textContent = force ? t('popup.refreshing') : t('popup.loading');
  $table.hidden = true;
  $activeHeading.hidden = true;
  $watchingSection.hidden = true;
  try {
    const [res, watchlist] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'getData', force }),
      window.ZGM_WATCH.getAll(),
    ]);
    if (!res?.ok) throw new Error(res?.error || 'unknown');
    lastPayload = res.payload;
    lastWatchlist = watchlist;
    render();
  } catch (err) {
    $status.textContent = t('popup.failed', { msg: err.message });
  }
}

function renderActive() {
  const payload = lastPayload;
  const watchlist = lastWatchlist;
  const properties = payload.properties?.properties || [];
  const byKey = new Map(properties.map((p) => [p.key, p]));

  // Defensive filter: the Katowice crawler currently dumps every BIP-board
  // announcement into active.json regardless of date, and the city portal
  // takes its time archiving past-auction documents (see TODO.md). Drop
  // anything whose auction date has already passed so "currently active"
  // means what it says. Proper fix lives in cities/katowice/crawl.js.
  const today = new Date().toISOString().slice(0, 10);
  const liveActive = (payload.active?.listings || []).filter(
    (a) => !a.auction_date || a.auction_date >= today,
  );

  const items = liveActive.map((a) => {
    const prop = a.address ? byKey.get(a.address.key) : null;
    const prior = prop
      ? prop.listings.filter(
          (l) => l.outcome !== 'active' && l.outcome !== 'announced',
        )
      : [];
    const unsold = prior.filter((l) => l.outcome === 'unsold');
    const lastUnsold = unsold[unsold.length - 1];
    const key = a.address?.key;
    return { a, prop, prior, unsold, lastUnsold, key };
  });
  sortActiveItems(items);

  $tbody.innerHTML = items
    .map(({ a, prior, unsold, lastUnsold, key }) => {
      const cityTag = cityTagHtml(a.city || cityFromKey(key));
      const addr = cityTag + (a.address_raw || '') + (a.area_m2 ? ` · ${a.area_m2} m²` : '');
      // "nowa" (new) only when this really is a first auction with no recorded
      // history. A 2nd/3rd przetarg is a re-listing, not new — show its round.
      const priorCell =
        prior.length > 0
          ? `<span class="zgm-prior">${t('popup.prior_summary', { n: prior.length, unsold: unsold.length })}</span>`
          : a.round > 1
            ? `<span class="zgm-prior">${roundLabel(a.round)}</span>`
            : `<span class="zgm-fresh">${t('popup.fresh')}</span>`;
      const lastUnsoldCell = lastUnsold
        ? `${lastUnsold.date} @ ${fmtPLN(lastUnsold.starting_price_pln)}`
        : '—';
      const watched = key ? watchlist[key] : null;
      const star = `<button type="button" class="zgm-star ${watched ? 'on' : ''}" data-key="${key || ''}" title="${t(watched ? 'watch.button.remove' : 'watch.button.add')}">${watched ? '★' : '☆'}</button>`;
      const askM2 = (a.area_m2 && a.starting_price_pln != null) ? new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Math.round(a.starting_price_pln / a.area_m2)) + ' zł/m²' : '—';
      const datesCell = datesCellHtml(a);
      return `
        <tr data-url="${a.detail_url || ''}">
          <td class="zgm-star-cell">${star}</td>
          <td>${addr}</td>
          <td>${t('kind.' + (a.kind || 'unknown'))}</td>
          <td class="zgm-dates-cell">${datesCell}</td>
          <td>${fmtPLN(a.starting_price_pln)}</td>
          <td>${askM2}</td>
          <td>${priorCell}</td>
          <td>${lastUnsoldCell}</td>
        </tr>`;
    })
    .join('');

  // Row click → open detail page (but not when the click was on the star).
  for (const tr of $tbody.querySelectorAll('tr[data-url]')) {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.zgm-star')) return;
      const url = tr.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  }
  for (const btn of $tbody.querySelectorAll('.zgm-star')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      if (!key) return;
      const cur = await window.ZGM_WATCH.isWatched(key);
      const item = items.find((i) => i.key === key);
      const meta = item && item.a
        ? {
            addr: item.a.address_raw,
            kind: item.a.kind,
            detail_url: item.a.detail_url,
            city: item.a.city || cityFromKey(key),
          }
        : {};
      if (cur) await window.ZGM_WATCH.unwatch(key);
      else await window.ZGM_WATCH.watch(key, meta);
      lastWatchlist = await window.ZGM_WATCH.getAll();
      render();
    });
  }

  $activeHeading.hidden = false;
  $table.hidden = false;
}

function renderWatching() {
  const payload = lastPayload;
  const watchlist = lastWatchlist;
  const entries = Object.entries(watchlist);
  if (entries.length === 0) {
    $watchingSection.hidden = true;
    return;
  }
  const properties = payload.properties?.properties || [];
  const byKey = new Map(properties.map((p) => [p.key, p]));

  $watchingTbody.innerHTML = entries
    .map(([key, entry]) => {
      const prop = byKey.get(key);
      const active = prop?.listings.find((l) => l.outcome === 'active');
      const prior = prop
        ? prop.listings.filter(
            (l) => l.outcome !== 'active' && l.outcome !== 'announced',
          )
        : [];
      const unsold = prior.filter((l) => l.outcome === 'unsold').length;
      let statusHtml;
      if (active) {
        const wad = active.wadium_deadline ? `, ${t('popup.col.wadium_by').toLowerCase()} ${wadiumCellHtml(active.wadium_deadline)}` : '';
        statusHtml = `<span class="zgm-active">${active.date} · ${fmtPLN(active.starting_price_pln)}${wad}</span>` +
          (prior.length ? ` <span class="zgm-prior">(${prior.length}×, ${unsold} unsold)</span>` : '');
      } else if (prior.length) {
        statusHtml = `<span class="zgm-historical">${t('popup.watching.historical_only', { n: prior.length, unsold })}</span>`;
      } else {
        statusHtml = '<span class="muted">—</span>';
      }
      const url = active?.detail_url || entry.detail_url || '';
      const city = prop?.city || entry.city || cityFromKey(key);
      const addrCell = cityTagHtml(city) + entry.addr;
      return `
        <tr data-url="${url}">
          <td class="zgm-star-cell"><button type="button" class="zgm-star on" data-key="${key}" title="${t('watch.button.remove')}">★</button></td>
          <td>${addrCell}</td>
          <td>${statusHtml}</td>
          <td>${url ? `<a target="_blank" rel="noopener" href="${url}">→</a>` : ''}</td>
        </tr>`;
    })
    .join('');

  for (const btn of $watchingTbody.querySelectorAll('.zgm-star')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const key = btn.dataset.key;
      await window.ZGM_WATCH.unwatch(key);
      lastWatchlist = await window.ZGM_WATCH.getAll();
      render();
    });
  }
  for (const tr of $watchingTbody.querySelectorAll('tr[data-url]')) {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.zgm-star') || e.target.tagName === 'A') return;
      const url = tr.dataset.url;
      if (url) chrome.tabs.create({ url });
    });
  }
  $watchingSection.hidden = false;
}

function render() {
  if (!lastPayload) return;
  $status.hidden = true;
  renderWatching();
  renderActive();
  const fetched = new Date(lastPayload.fetched_at);
  const meta = lastPayload.meta || {};
  // Match the same past-date filter renderActive uses so the count in the
  // footer is consistent with the number of rows the user sees.
  const today = new Date().toISOString().slice(0, 10);
  const activeCount = (lastPayload.active?.listings || []).filter(
    (a) => !a.auction_date || a.auction_date >= today,
  ).length;
  $meta.textContent = t('popup.meta', {
    active: activeCount,
    tracked: meta.unique_properties || '?',
    when: fetched.toLocaleString(window.ZGM_I18N.getLang()),
  });
}

// Theme button: show ☀ in light mode (click → dark) and ☾ in dark mode
// (click → light). Title is i18n'd so it follows the lang toggle.
function syncThemeButton() {
  if (!$themeToggle || !window.ZGM_THEME) return;
  const eff = window.ZGM_THEME.getEffective();
  $themeToggle.textContent = eff === 'dark' ? '☾' : '☀';
  $themeToggle.title = t(eff === 'dark' ? 'theme.toggle.to_light' : 'theme.toggle.to_dark');
}

(async () => {
  await Promise.all([window.ZGM_I18N.ready, window.ZGM_THEME?.ready]);
  applyStaticI18n();
  syncThemeButton();
  window.ZGM_I18N.onChange(() => {
    applyStaticI18n();
    syncThemeButton();
    render();
  });
  window.ZGM_THEME?.onChange(syncThemeButton);
  window.ZGM_WATCH.onChange(async () => {
    lastWatchlist = await window.ZGM_WATCH.getAll();
    render();
  });
  $refresh.addEventListener('click', () => load(true));
  $langToggle.addEventListener('click', () => {
    const next = window.ZGM_I18N.getLang() === 'pl' ? 'en' : 'pl';
    window.ZGM_I18N.setLang(next);
  });
  $themeToggle?.addEventListener('click', () => window.ZGM_THEME?.toggle());

  // Sortable column headers on the active table. Date defaults to asc
  // (soonest first — what the user typically wants); other columns default
  // to desc (most expensive / most-relisted first). Re-clicking the same
  // column toggles direction.
  for (const th of $table.querySelectorAll('th[data-sort]')) {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (activeSortKey === k) {
        activeSortDir = activeSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        activeSortKey = k;
        activeSortDir = k === 'date' ? 'asc' : 'desc';
      }
      for (const t2 of $table.querySelectorAll('th[data-sort]')) {
        t2.classList.remove('sorted-asc', 'sorted-desc');
      }
      th.classList.add(activeSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      if (lastPayload) renderActive();
    });
  }

  load(false);
})();
