// Lightweight i18n for the extension. Two languages, one toggle. PL is the
// default since the source data is Polish municipal records.
//
// API exposed on window.ZGM_I18N:
//   t(key, vars?)        format a translated string with ${name} substitution
//   getLang()            'pl' | 'en'
//   setLang(lang)        persist + broadcast (returns Promise)
//   onChange(fn)         fn(lang) when the lang storage key changes
//
// Translations are flat key→string maps. Keys missing in PL fall back to EN.

(function () {
  const STORAGE_KEY = 'lang';
  const DEFAULT_LANG = 'pl';

  /** @type {Record<string, Record<string, string>>} */
  const STRINGS = {
    en: {
      // popup
      'popup.title': 'ZGM Gliwice — auction history',
      'popup.currently_active': 'Currently active',
      'popup.refresh': 'Refresh data',
      'popup.loading': 'Loading…',
      'popup.refreshing': 'Refreshing…',
      'popup.failed': 'Failed to load: ${msg}',
      'popup.col.property': 'Property',
      'popup.col.kind': 'Kind',
      'popup.col.dates': 'Dates',
      'popup.label.auction': 'auction',
      'popup.label.wadium': 'wadium',
      'popup.label.viewing': 'viewing',
      'popup.col.wadium_by': 'Wadium by',
      'popup.urgent': 'soon',
      'popup.col.auction': 'Auction',
      'popup.col.ask': 'Ask',
      'popup.col.prior': 'Prior',
      'popup.col.last_unsold': 'Last unsold',
      'popup.fresh': 'new',
      'popup.prior_summary': 'listed ${n}× before',
      'popup.col.status': 'Status',
      'popup.active_section': 'Currently active',
      'popup.watching_section': 'Watching',
      'popup.watching.historical_only': 'Not currently active — ${n}× prior (${unsold} unsold)',
      'watch.button.add': 'Watch',
      'watch.button.remove': 'Unwatch',
      'notif.title': 'ZGM Gliwice — watched property listed',
      'notif.body': '${addr} — auction ${date} at ${price}',
      'popup.archive_link': 'Archive',
      'archive.title': 'ZGM Gliwice — auction archive',
      'archive.provenance': 'Data from ${from} to ${to} · last refreshed ${updated}',
      'archive.back': 'Back to popup',
      'archive.summary': 'Summary',
      'archive.sold_suffix': 'sold',
      'archive.archived_suffix': 'in archive',
      'archive.median': 'median',
      'archive.median_start': 'median start',
      'archive.median_m2': 'median PLN/m²',
      'archive.filter.city': 'City',
      'archive.filter.kind': 'Kind',
      'archive.filter.outcome': 'Outcome',
      'archive.filter.min_year': 'From year',
      'archive.filter.year': 'Year',
      'archive.filter.all_years': 'All years',
      'archive.filter.all': 'All',
      'archive.filter.search': 'Search street',
      'archive.filter.search_placeholder': 'e.g. Zwycięstwa',
      'archive.historical_section': 'Historical (sold / unsold)',
      'archive.active_empty': 'No active listings match the current filters.',
      'archive.col.area': 'area',
      'archive.rowcount': '${n} record(s)',
      'popup.meta':
        '${active} active · ${tracked} properties tracked · refreshed ${when}',
      'popup.repo': 'repo',
      'popup.support': 'Support this project',
      'popup.lang_toggle.to_pl': 'PL',
      'popup.lang_toggle.to_en': 'EN',
      'theme.toggle.to_dark': 'Switch to dark mode',
      'theme.toggle.to_light': 'Switch to light mode',

      // badges on listing index pages
      'badge.first': 'no prior auctions',
      'badge.no_archive': 'no archive data',
      'badge.prev_unsold':
        'prev ${n}× — ${unsold} unsold${sold_clause}',
      'badge.prev_unsold.sold_clause': ', ${sold} sold',
      'badge.prev_sold': 'prev ${n}× sold',
      'chip.round': 'auction ${r}',

      // tooltip/table headers
      'col.date': 'date',
      'col.round': 'round',
      'col.start_price': 'start price',
      'col.price_per_m2': 'PLN/m²',
      'popup.col.ask_per_m2': 'Ask/m²',
      'col.outcome': 'outcome',
      'col.note': 'note',
      'col.kind': 'kind',
      'col.final': 'final',
      'col.reason': 'reason',
      'col.src': 'src',

      // outcomes
      'outcome.sold': 'sold',
      'outcome.unsold': 'unsold',
      'outcome.archived': 'past (result not published)',
      'outcome.no_winner': 'no winner',
      'outcome.sold_for': 'sold ${price}',

      // unsold reason enum
      'reason.no_deposits': 'no bidders registered',
      'reason.bidder_withdrew': 'bidder withdrew',
      'reason.bidder_noshow': 'bidder no-show',
      'reason.unknown': 'reason unknown',

      // kind enum
      'kind.mieszkalny': 'residential',
      'kind.uzytkowy': 'commercial',
      'kind.garaz': 'garage',
      'kind.unknown': 'unknown',

      // city labels (popup chip)
      'city.gliwice': 'Gliwice',
      'city.katowice': 'Katowice',
      'city.bytom': 'Bytom',
      'city.zabrze': 'Zabrze',
      'city.sosnowiec': 'Sosnowiec',
      'city.rybnik': 'Rybnik',
      'city.bielsko': 'Bielsko-Biała',
      'city.myslowice': 'Mysłowice',
      'city.swietochlowice': 'Świętochłowice',

      // detail-page panel
      'panel.title': 'Auction history — ${addr}',
      'panel.none':
        'No prior listings found for this property in the archive (since 2024-02).',
      'panel.summary_one':
        '<strong>${n}</strong> prior attempt (${unsold} unsold). Current ask <strong>${ask}</strong> vs first attempt ${date} at <strong>${first}</strong> — <span class="zgm-ext-delta">${sign}${delta} (${sign}${pct}%)</span>.',
      'panel.summary_many':
        '<strong>${n}</strong> prior attempts (${unsold} unsold). Current ask <strong>${ask}</strong> vs first attempt ${date} at <strong>${first}</strong> — <span class="zgm-ext-delta">${sign}${delta} (${sign}${pct}%)</span>.',
      'panel.summary_m2':
        'Per m²: <strong>${ask_m2}</strong> vs <strong>${first_m2}</strong> — <span class="zgm-ext-delta">${sign}${delta_m2}</span>.',
      'panel.footer_data': 'Data:',
    },

    pl: {
      // popup
      'popup.title': 'ZGM Gliwice — historia aukcji',
      'popup.currently_active': 'Aktualne aukcje',
      'popup.refresh': 'Odśwież dane',
      'popup.loading': 'Wczytywanie…',
      'popup.refreshing': 'Odświeżanie…',
      'popup.failed': 'Błąd wczytywania: ${msg}',
      'popup.col.property': 'Nieruchomość',
      'popup.col.kind': 'Typ',
      'popup.col.dates': 'Daty',
      'popup.label.auction': 'aukcja',
      'popup.label.wadium': 'wadium',
      'popup.label.viewing': 'oględziny',
      'popup.col.wadium_by': 'Wadium do',
      'popup.urgent': 'pilne',
      'popup.col.auction': 'Aukcja',
      'popup.col.ask': 'Cena',
      'popup.col.prior': 'Historia',
      'popup.col.last_unsold': 'Ostatnia bez sprzedaży',
      'popup.fresh': 'nowa',
      'popup.prior_summary': 'wystawiona ${n}× wcześniej',
      'popup.col.status': 'Status',
      'popup.active_section': 'Aktualne aukcje',
      'popup.watching_section': 'Obserwowane',
      'popup.watching.historical_only': 'Brak aktywnej aukcji — ${n}× wcześniej (${unsold} bez sprzedaży)',
      'watch.button.add': 'Obserwuj',
      'watch.button.remove': 'Przestań obserwować',
      'notif.title': 'ZGM Gliwice — nowa aukcja obserwowanej nieruchomości',
      'notif.body': '${addr} — aukcja ${date} po ${price}',
      'popup.archive_link': 'Archiwum',
      'archive.title': 'Archiwum aukcji ZGM Gliwice',
      'archive.provenance': 'Dane od ${from} do ${to} · ostatnie odświeżenie ${updated}',
      'archive.back': 'Wróć do popupa',
      'archive.summary': 'Podsumowanie',
      'archive.sold_suffix': 'sprzedanych',
      'archive.archived_suffix': 'w archiwum',
      'archive.median': 'mediana',
      'archive.median_start': 'mediana wyw.',
      'archive.median_m2': 'mediana zł/m²',
      'archive.filter.city': 'Miasto',
      'archive.filter.kind': 'Typ',
      'archive.filter.outcome': 'Wynik',
      'archive.filter.min_year': 'Od roku',
      'archive.filter.year': 'Rok',
      'archive.filter.all_years': 'Wszystkie lata',
      'archive.filter.all': 'Wszystkie',
      'archive.filter.search': 'Szukaj ulicy',
      'archive.filter.search_placeholder': 'np. Zwycięstwa',
      'archive.historical_section': 'Historyczne (sprzedane / bez sprzedaży)',
      'archive.active_empty': 'Brak aktywnych aukcji pasujących do filtrów.',
      'archive.col.area': 'powierzchnia',
      'archive.rowcount': '${n} rekord(ów)',
      'popup.meta':
        '${active} aktywnych · ${tracked} nieruchomości w bazie · odświeżono ${when}',
      'popup.repo': 'repozytorium',
      'popup.support': 'Wesprzyj projekt',
      'popup.lang_toggle.to_pl': 'PL',
      'popup.lang_toggle.to_en': 'EN',
      'theme.toggle.to_dark': 'Przełącz na ciemny motyw',
      'theme.toggle.to_light': 'Przełącz na jasny motyw',

      // badges
      'badge.first': 'brak wcześniejszych aukcji',
      'badge.no_archive': 'brak danych archiwalnych',
      'badge.prev_unsold':
        'poprzednio ${n}× — ${unsold} bez sprzedaży${sold_clause}',
      'badge.prev_unsold.sold_clause': ', ${sold} sprzedane',
      'badge.prev_sold': 'poprzednio ${n}× sprzedane',
      'chip.round': '${r}. przetarg',

      // tooltip/table headers
      'col.date': 'data',
      'col.round': 'runda',
      'col.start_price': 'cena wywoławcza',
      'col.price_per_m2': 'zł/m²',
      'popup.col.ask_per_m2': 'Cena/m²',
      'col.outcome': 'wynik',
      'col.note': 'uwagi',
      'col.kind': 'typ',
      'col.final': 'cena końcowa',
      'col.reason': 'powód',
      'col.src': 'źródło',

      // outcomes
      'outcome.sold': 'sprzedane',
      'outcome.unsold': 'bez sprzedaży',
      'outcome.archived': 'zakończone (brak wyniku)',
      'outcome.no_winner': 'brak nabywcy',
      'outcome.sold_for': 'sprzedane za ${price}',

      // unsold reasons
      'reason.no_deposits': 'brak ofert',
      'reason.bidder_withdrew': 'uczestnik wycofał się',
      'reason.bidder_noshow': 'uczestnik nie stawił się',
      'reason.unknown': 'powód nieznany',

      // kind enum
      'kind.mieszkalny': 'mieszkalny',
      'kind.uzytkowy': 'użytkowy',
      'kind.garaz': 'garaż',
      'kind.unknown': 'nieznany',

      // city labels (popup chip)
      'city.gliwice': 'Gliwice',
      'city.katowice': 'Katowice',
      'city.bytom': 'Bytom',
      'city.zabrze': 'Zabrze',
      'city.sosnowiec': 'Sosnowiec',
      'city.rybnik': 'Rybnik',
      'city.bielsko': 'Bielsko-Biała',
      'city.myslowice': 'Mysłowice',
      'city.swietochlowice': 'Świętochłowice',

      // detail-page panel
      'panel.title': 'Historia aukcji — ${addr}',
      'panel.none':
        'Brak wcześniejszych aukcji tej nieruchomości w archiwum (od lutego 2024).',
      'panel.summary_one':
        '<strong>${n}</strong> poprzednia próba (${unsold} bez sprzedaży). Aktualna cena <strong>${ask}</strong> vs pierwsza próba ${date} po <strong>${first}</strong> — <span class="zgm-ext-delta">${sign}${delta} (${sign}${pct}%)</span>.',
      'panel.summary_many':
        '<strong>${n}</strong> poprzednich prób (${unsold} bez sprzedaży). Aktualna cena <strong>${ask}</strong> vs pierwsza próba ${date} po <strong>${first}</strong> — <span class="zgm-ext-delta">${sign}${delta} (${sign}${pct}%)</span>.',
      'panel.summary_m2':
        'Za m²: <strong>${ask_m2}</strong> vs <strong>${first_m2}</strong> — <span class="zgm-ext-delta">${sign}${delta_m2}</span>.',
      'panel.footer_data': 'Dane:',
    },
  };

  let _lang = DEFAULT_LANG;
  const listeners = new Set();

  function format(template, vars) {
    if (!vars) return template;
    return template.replace(/\$\{(\w+)\}/g, (_, k) =>
      vars[k] != null ? String(vars[k]) : '',
    );
  }

  function t(key, vars) {
    const en = STRINGS.en[key];
    const tr = STRINGS[_lang]?.[key];
    const template = tr != null ? tr : en;
    if (template == null) return key;
    return format(template, vars);
  }

  function getLang() {
    return _lang;
  }

  async function setLang(lang) {
    if (lang !== 'pl' && lang !== 'en') return;
    _lang = lang;
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: lang });
    } catch {}
    for (const fn of listeners) {
      try { fn(lang); } catch {}
    }
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Initial load. Resolves once chrome.storage has been read. Other scripts
  // should `await window.ZGM_I18N.ready` before reading t() if it matters.
  const ready = (async () => {
    try {
      const v = await chrome.storage.local.get(STORAGE_KEY);
      if (v[STORAGE_KEY] === 'en' || v[STORAGE_KEY] === 'pl') {
        _lang = v[STORAGE_KEY];
      }
    } catch {}
  })();

  // Sync across windows / tabs.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const next = changes[STORAGE_KEY].newValue;
      if ((next === 'en' || next === 'pl') && next !== _lang) {
        _lang = next;
        for (const fn of listeners) {
          try { fn(next); } catch {}
        }
      }
    });
  } catch {}

  window.ZGM_I18N = { t, getLang, setLang, onChange, ready };
})();
