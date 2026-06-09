// Full-page archive view. Loads via the same getOrFetch path used by the
// popup, then renders three summary tiles (median sale price + median PLN/m²
// per kind) and a filterable + sortable table of every historical record.

const $status = document.getElementById('status');
const $summary = document.getElementById('summary');
const $filters = document.getElementById('filters');
const $table = document.getElementById('archive-table');
const $tbody = $table.querySelector('tbody');
const $langToggle = document.getElementById('lang-toggle');
const $themeToggle = document.getElementById('theme-toggle');
const $filterCity = document.getElementById('filter-city');
const $filterKind = document.getElementById('filter-kind');
const $filterOutcome = document.getElementById('filter-outcome');
const $filterYear = document.getElementById('filter-year');
const $filterSearch = document.getElementById('filter-search');
const $rowcount = document.getElementById('rowcount');
const $provenance = document.getElementById('provenance');
const $activeSection = document.getElementById('active-section');
const $activeTable = document.getElementById('active-table');
const $activeTbody = $activeTable.querySelector('tbody');
const $activeEmpty = document.getElementById('active-empty');
const $historicalSection = document.getElementById('historical-section');

const t = (k, vars) => window.ZGM_I18N.t(k, vars);
const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const fmtPLN = (n) => (n == null ? '—' : nf.format(n) + ' zł');
const fmtPerM2 = (price, area) =>
  price == null || area == null || area === 0
    ? '—'
    : nf.format(Math.round(price / area)) + ' zł/m²';

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

// Compact city chip prepended to property cells (the archive mixes cities).
function cityTagHtml(city) {
  // Single-city (Gliwice) build: suppress the redundant chip.
  return '';
  // eslint-disable-next-line no-unreachable
  if (!city) return '';
  const label = t('city.' + city);
  const display = label === 'city.' + city
    ? city.charAt(0).toUpperCase() + city.slice(1)
    : label;
  return `<span class="zgm-city-tag" data-city="${city}">${display}</span> `;
}

let records = [];
let activeListings = [];
let propByKey = new Map();
let lastMeta = null;
let lastFetchedAt = null;

// Active-table sort state (separate from the historical table's sortKey).
// Null = the default "most-relisted first" heuristic in renderActiveTable.
let activeSortKey = null;
let activeSortDir = 'asc';

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

function wadiumCellHtml(date) {
  if (!date) return '—';
  const today = new Date();
  const target = new Date(date + 'T00:00:00');
  const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return `<span class="zgm-past">${date}</span>`;
  if (daysLeft <= 7) return `<span class="zgm-urgent" title="${daysLeft}d">${date}</span>`;
  return date;
}

function datesCellHtml(a) {
  const rows = [];
  if (a.auction_date) rows.push(`<span class="zgm-date-label">${t('popup.label.auction')}</span> ${a.auction_date}`);
  if (a.wadium_deadline) rows.push(`<span class="zgm-date-label">${t('popup.label.wadium')}</span> ${wadiumCellHtml(a.wadium_deadline)}`);
  if (a.viewing_date) rows.push(`<span class="zgm-date-label">${t('popup.label.viewing')}</span> ${a.viewing_date}`);
  return rows.join('<br>');
}

function applyStaticI18n() {
  document.documentElement.lang = window.ZGM_I18N.getLang();
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  $filterSearch.placeholder = t('archive.filter.search_placeholder');
  const cur = window.ZGM_I18N.getLang();
  $langToggle.textContent =
    cur === 'pl' ? t('popup.lang_toggle.to_en') : t('popup.lang_toggle.to_pl');
}

async function load() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getData' });
    if (!res?.ok) throw new Error(res?.error || 'unknown');
    flatten(res.payload);
    activeListings = res.payload.active?.listings || [];
    propByKey = new Map(
      (res.payload.properties?.properties || []).map((p) => [p.key, p]),
    );
    lastMeta = res.payload.meta || null;
    lastFetchedAt = res.payload.fetched_at || null;
    populateYears();
    renderAll();
    $status.hidden = true;
    $summary.hidden = false;
    $filters.hidden = false;
    $table.hidden = false;
    $activeSection.hidden = false;
    $historicalSection.hidden = false;
  } catch (err) {
    $status.textContent = t('popup.failed', { msg: err.message });
  }
}

function flatten(payload) {
  records = [];
  const props = payload.properties?.properties || [];
  for (const p of props) {
    for (const l of p.listings) {
      // 'archived' = a past auction from an announcement-only city (Bytom/
      // Zabrze) — concluded, achieved price not published. Shown in the
      // historical table with its starting price.
      if (l.outcome === 'sold' || l.outcome === 'unsold' || l.outcome === 'archived') {
        records.push({
          date: l.date,
          city: p.city || null,
          street: p.street,
          building: p.building,
          apt: p.apt,
          addr_display:
            `${p.street} ${p.building}${p.apt ? '/' + p.apt : ''}`,
          street_search: (p.street_norm + ' ' + p.building + ' ' + (p.apt || ''))
            .toLowerCase(),
          kind: l.kind || p.kind || 'unknown',
          area_m2: l.area_m2 ?? p.area_m2 ?? null,
          round: l.round,
          starting_price_pln: l.starting_price_pln,
          final_price_pln: l.final_price_pln,
          outcome: l.outcome,
          unsold_reason: l.unsold_reason,
          source_pdf: l.source_pdf,
        });
      }
    }
  }
  records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// "" = all years; otherwise an exact 4-digit year string.
function selectedYear() {
  return $filterYear && $filterYear.value ? $filterYear.value : '';
}
function matchesYear(r, year) {
  if (!year) return true;
  return !!r.date && r.date.slice(0, 4) === year;
}

// Fill the year dropdown from the distinct auction years present in the data
// (newest first), with an "All years" option on top. Preserves the current
// selection across re-populations.
function populateYears() {
  if (!$filterYear) return;
  const years = [...new Set(
    records.map((r) => (r.date ? r.date.slice(0, 4) : null)).filter(Boolean),
  )].sort((a, b) => b.localeCompare(a));
  const prev = $filterYear.value;
  const allLabel = t('archive.filter.all_years');
  $filterYear.innerHTML =
    `<option value="">${allLabel}</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join('');
  // restore previous selection if still valid, else default to all years
  $filterYear.value = years.includes(prev) ? prev : '';
}

function renderSummary() {
  const city = $filterCity.value;
  const year = selectedYear();
  const scope = records.filter(
    (r) => (city === 'all' || r.city === city) && matchesYear(r, year),
  );
  for (const tile of document.querySelectorAll('#summary .tile')) {
    const kind = tile.dataset.kind;
    const ofKind = scope.filter((r) => r.kind === kind);
    const sold = ofKind.filter(
      (r) => r.outcome === 'sold' && r.final_price_pln != null,
    );

    // Cities with an achieved-price stream (Gliwice) summarise SOLD prices.
    // Announcement-only cities have no sold records — every row is 'archived' —
    // so fall back to counting all archived auctions and showing the median
    // STARTING (wywoławcza) price instead, which is the data that exists.
    let count, prices, m2vals, suffixKey, labelKey;
    if (sold.length) {
      count = sold.length;
      prices = sold.map((r) => r.final_price_pln);
      m2vals = sold.filter((r) => r.area_m2).map((r) => r.final_price_pln / r.area_m2);
      suffixKey = 'archive.sold_suffix';
      labelKey = 'archive.median';
    } else {
      count = ofKind.length; // records[] holds only historical rows (no active)
      prices = ofKind.filter((r) => r.starting_price_pln != null).map((r) => r.starting_price_pln);
      m2vals = ofKind
        .filter((r) => r.area_m2 && r.starting_price_pln != null)
        .map((r) => r.starting_price_pln / r.area_m2);
      suffixKey = 'archive.archived_suffix';
      labelKey = 'archive.median_start';
    }

    tile.querySelector('.n').textContent = count;
    tile.querySelector('.suffix').textContent = t(suffixKey);
    tile.querySelector('.med-label').textContent = t(labelKey);
    tile.querySelector('.med-total').textContent = prices.length ? fmtPLN(median(prices)) : '—';
    tile.querySelector('.med-m2').textContent =
      m2vals.length ? nf.format(Math.round(median(m2vals))) + ' zł/m²' : '—';
  }
}

let sortKey = 'date';
let sortDir = 'desc';

function getSortValue(r, key) {
  switch (key) {
    case 'date': return r.date || '';
    case 'round': return r.round ?? -1;
    case 'area': return r.area_m2 ?? -1;
    case 'price': return r.starting_price_pln ?? -1;
    case 'final': return r.final_price_pln ?? -1;
    case 'm2':
      return r.area_m2 && r.starting_price_pln
        ? r.starting_price_pln / r.area_m2 : -1;
    default: return '';
  }
}

function renderTable() {
  const city = $filterCity.value;
  const kind = $filterKind.value;
  const outcome = $filterOutcome.value;
  const year = selectedYear();
  const q = $filterSearch.value.trim().toLowerCase();

  let rows = records.slice();
  if (city !== 'all') rows = rows.filter((r) => r.city === city);
  if (kind !== 'all') rows = rows.filter((r) => r.kind === kind);
  if (outcome !== 'all') rows = rows.filter((r) => r.outcome === outcome);
  if (year) rows = rows.filter((r) => matchesYear(r, year));
  if (q) rows = rows.filter((r) => r.street_search.includes(q));

  rows.sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    let cmp;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  $rowcount.textContent = t('archive.rowcount', { n: rows.length });
  $tbody.innerHTML = rows
    .map(
      (r) => `
      <tr class="zgm-ext-row-${r.outcome}">
        <td>${r.date || '—'}</td>
        <td>${cityTagHtml(r.city)}${r.addr_display}</td>
        <td>${t('kind.' + r.kind)}</td>
        <td>${roundCell(r.round)}</td>
        <td>${r.area_m2 ? r.area_m2 + ' m²' : '—'}</td>
        <td>${fmtPLN(r.starting_price_pln)}</td>
        <td>${fmtPLN(r.final_price_pln)}</td>
        <td>${fmtPerM2(r.outcome === 'sold' ? r.final_price_pln : r.starting_price_pln, r.area_m2)}</td>
        <td>${outcomeLabel(r)}</td>
        <td>${r.source_pdf ? `<a target="_blank" rel="noopener" href="${r.source_pdf}">PDF</a>` : ''}</td>
      </tr>`,
    )
    .join('');
}

function roundCell(n) {
  if (!n) return '—';
  return t('chip.round', { r: String(n) });
}

function outcomeLabel(r) {
  if (r.outcome === 'sold') return t('outcome.sold');
  if (r.outcome === 'unsold') {
    const reason = r.unsold_reason ? ` (${t('reason.' + r.unsold_reason)})` : '';
    return t('outcome.unsold') + reason;
  }
  if (r.outcome === 'archived') return t('outcome.archived');
  return r.outcome;
}


function renderProvenance() {
  if (!records.length) return;
  const dates = records.map((r) => r.date).filter(Boolean).sort();
  const from = dates[0] || '?';
  const to = dates[dates.length - 1] || '?';
  let updated = '?';
  const iso = lastMeta?.generated_at || (lastFetchedAt ? new Date(lastFetchedAt).toISOString() : null);
  if (iso) updated = iso.slice(0, 10);
  $provenance.textContent = t('archive.provenance', { from, to, updated });
  $provenance.hidden = false;
}

function renderActiveTable() {
  const city = $filterCity.value;
  const kind = $filterKind.value;
  const q = $filterSearch.value.trim().toLowerCase();

  const today = new Date().toISOString().slice(0, 10);
  const items = activeListings
    .filter((a) => !a.auction_date || a.auction_date >= today)
    .filter((a) => city === 'all' || a.city === city)
    .filter((a) => kind === 'all' || a.kind === kind)
    .filter((a) => {
      if (!q) return true;
      const s = (a.address_raw || '').toLowerCase();
      return s.includes(q);
    })
    .map((a) => {
      const prop = a.address ? propByKey.get(a.address.key) : null;
      const prior = prop
        ? prop.listings.filter(
            (l) => l.outcome !== 'active' && l.outcome !== 'announced',
          )
        : [];
      const unsold = prior.filter((l) => l.outcome === 'unsold');
      const lastUnsold = unsold[unsold.length - 1];
      return { a, prop, prior, unsold, lastUnsold };
    });
  // Heuristic by default, user-clickable headers can override (see the
  // click handlers at the bottom of this file).
  sortActiveItems(items);

  $activeTbody.innerHTML = items
    .map(({ a, prior, unsold, lastUnsold }) => {
      const addr = cityTagHtml(a.city) + (a.address_raw || '') + (a.area_m2 ? ` · ${a.area_m2} m²` : '');
      const priorCell =
        prior.length === 0
          ? `<span class="zgm-fresh">${t('popup.fresh')}</span>`
          : `<span class="zgm-prior">${t('popup.prior_summary', { n: prior.length, unsold: unsold.length })}</span>`;
      const lastUnsoldCell = lastUnsold
        ? `${lastUnsold.date} @ ${fmtPLN(lastUnsold.starting_price_pln)}`
        : '—';
      const askM2 = a.area_m2 && a.starting_price_pln
        ? nf.format(Math.round(a.starting_price_pln / a.area_m2)) + ' zł/m²'
        : '—';
      const datesCell = datesCellHtml(a);
      return `
        <tr data-url="${a.detail_url || ''}">
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

  for (const tr of $activeTbody.querySelectorAll('tr[data-url]')) {
    tr.addEventListener('click', () => {
      const url = tr.dataset.url;
      if (url) window.open(url, '_blank', 'noopener');
    });
  }

  const empty = items.length === 0;
  $activeTable.hidden = empty;
  $activeEmpty.hidden = !empty;
}

function renderAll() {
  renderProvenance();
  renderSummary();
  renderActiveTable();
  renderTable();
}

function syncThemeButton() {
  if (!$themeToggle || !window.ZGM_THEME) return;
  const eff = window.ZGM_THEME.getEffective();
  $themeToggle.textContent = eff === 'dark' ? '☾' : '☀';
  $themeToggle.title = t(eff === 'dark' ? 'theme.toggle.to_light' : 'theme.toggle.to_dark');
}

(async () => {
  await Promise.all([
    window.ZGM_I18N.ready,
    window.ZGM_THEME?.ready,
    window.ZGM_SETTINGS?.ready,
  ]);
  applyStaticI18n();
  syncThemeButton();
  window.ZGM_I18N.onChange(() => {
    applyStaticI18n();
    syncThemeButton();
    renderAll();
  });
  window.ZGM_THEME?.onChange(syncThemeButton);
  $langToggle.addEventListener('click', () => {
    const next = window.ZGM_I18N.getLang() === 'pl' ? 'en' : 'pl';
    window.ZGM_I18N.setLang(next);
  });
  $themeToggle?.addEventListener('click', () => window.ZGM_THEME?.toggle());
  const onFilterChange = () => { renderSummary(); renderActiveTable(); renderTable(); };
  $filterCity.addEventListener('change', onFilterChange);
  $filterKind.addEventListener('change', onFilterChange);
  $filterOutcome.addEventListener('change', renderTable);
  $filterYear?.addEventListener('change', () => {
    renderSummary();
    renderActiveTable();
    renderTable();
  });
  $filterSearch.addEventListener('input', onFilterChange);
  for (const th of $table.querySelectorAll('th[data-sort]')) {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = k; sortDir = k === 'date' ? 'desc' : 'desc'; }
      for (const t2 of $table.querySelectorAll('th[data-sort]')) {
        t2.classList.remove('sorted-asc', 'sorted-desc');
      }
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderTable();
    });
  }
  // Sortable headers for the "Currently active" table. Mirrors the popup —
  // date defaults asc (soonest first), other columns default desc.
  for (const th of $activeTable.querySelectorAll('th[data-sort]')) {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (activeSortKey === k) {
        activeSortDir = activeSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        activeSortKey = k;
        activeSortDir = k === 'date' ? 'asc' : 'desc';
      }
      for (const t2 of $activeTable.querySelectorAll('th[data-sort]')) {
        t2.classList.remove('sorted-asc', 'sorted-desc');
      }
      th.classList.add(activeSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      renderActiveTable();
    });
  }
  load();
})();
