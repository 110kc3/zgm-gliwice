
(async function () {
  const site = window.ZGM_SITES && window.ZGM_SITES.findFor(location.hostname);
  if (!site) return;

  const isListingIndex = site.isListingIndex(location.pathname);
  const isDetail = site.isDetail(location.pathname);
  if (!isListingIndex && !isDetail) return;

  await Promise.all([window.ZGM_I18N.ready, window.ZGM_SETTINGS?.ready]);
  const minYear = () => window.ZGM_SETTINGS?.getMinHistoryYear?.() ?? 0;
  const withinYearWindow = (l) => {
    if (
      l.outcome === 'active' ||
      l.outcome === 'announced' ||
      l.outcome === 'archived'
    )
      return true;
    const y = minYear();
    if (!y || !l.date) return true;
    return Number(l.date.slice(0, 4)) >= y;
  };

  const isPriorHistory = (l) =>
    l.outcome !== 'active' &&
    l.outcome !== 'announced' &&
    l.outcome !== 'archived' &&
    withinYearWindow(l);

  let payload;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getData' });
    if (!res?.ok) throw new Error(res?.error || 'unknown');
    payload = res.payload;
  } catch (err) {
    console.warn('[ZGM ext] failed to load data:', err);
    return;
  }

  const properties = payload.properties?.properties || [];
  const byKey = new Map(properties.map((p) => [p.key, p]));
  const nsKey = (addrKey) => `${site.city}|${addrKey}`;
  const lookup = (address) => byKey.get(nsKey(address.key));

  function render() {
    for (const el of document.querySelectorAll(
      '.zgm-ext-badge, .zgm-ext-panel, .zgm-ext-infochip, .zgm-ext-perm2',
    )) {
      el.remove();
    }
    if (isListingIndex) decorateIndex();
    if (isDetail) decorateDetail();
  }

  render();
  window.ZGM_I18N.onChange(render);
  window.ZGM_SETTINGS?.onChange(render);


  function decorateIndex() {
    const t = window.ZGM_I18N.t;
    const cards = site.collectCards();
    let decorated = 0;
    for (const card of cards) {
     try {
      const { element, address, area_m2, price_pln, descTarget } = card;
      const prop = lookup(address);
      const prior = prop ? prop.listings.filter(isPriorHistory) : [];

      if (area_m2 && price_pln && descTarget) {
        if (!descTarget.querySelector('.zgm-ext-perm2')) {
          const span = document.createElement('span');
          span.className = 'zgm-ext-perm2';
          span.textContent = ' (' + fmtPerM2(price_pln, area_m2) + ')';
          descTarget.appendChild(span);
        }
      }

      const statsChip = buildStatsChip(prop);
      if (statsChip) element.appendChild(statsChip);

      const activeListing = currentListing(prop);
      const datesChip = buildDatesChip(activeListing);
      if (datesChip) element.appendChild(datesChip);

      if (prior.length === 0) {
        const text =
          activeListing && activeListing.round > 1
            ? t('badge.no_archive')
            : t('badge.first');
        element.appendChild(makeBadge({ kind: 'fresh', text }));
      } else {
        const unsoldCount = prior.filter((l) => l.outcome === 'unsold').length;
        const soldCount = prior.filter((l) => l.outcome === 'sold').length;
        const kind =
          unsoldCount >= 2 ? 'red' : unsoldCount === 1 ? 'amber' : 'gray';
        let label;
        if (unsoldCount > 0) {
          const sold_clause = soldCount
            ? t('badge.prev_unsold.sold_clause', { sold: soldCount })
            : '';
          label = t('badge.prev_unsold', {
            n: prior.length,
            unsold: unsoldCount,
            sold_clause,
          });
        } else {
          label = t('badge.prev_sold', { n: prior.length });
        }
        const badge = makeBadge({ kind, text: label });
        badge.appendChild(buildTooltip(prop, area_m2));
        element.appendChild(badge);
      }
      decorated++;
     } catch (err) {
      console.warn('[ZGM ext] card decoration skipped:', err);
     }
    }
    console.log(`[ZGM ext] decorated ${decorated} listing card(s) on ${site.city}`);
  }


  function decorateDetail() {
    const t = window.ZGM_I18N.t;
    const detail = site.detailAddress();
    if (!detail) return;
    const { address, addressRaw } = detail;
    const prop = lookup(address);

    if (!prop) {
      injectPanel({
        title: t('panel.title', { addr: addressRaw }),
        body: `<p>${t('panel.none')}</p>`,
        watchKey: nsKey(address.key),
        watchMeta: {
          addr: addressRaw,
          kind: 'unknown',
          detail_url: location.href,
          city: site.city,
        },
      });
      return;
    }

    const prior = prop.listings.filter(isPriorHistory);
    const active = currentListing(prop);
    const rows = prior
      .map(
        (l) => `
        <tr class="zgm-ext-row-${l.outcome}">
          <td>${l.date ?? '?'}</td>
          <td>${kindLabel(l.kind)}</td>
          <td>${fmtPLN(l.starting_price_pln)}</td>
          <td>${fmtPerM2(l.starting_price_pln, l.area_m2 ?? prop.area_m2)}</td>
          <td>${outcomeLabel(l)}</td>
          <td>${l.outcome === 'sold' ? fmtPLN(l.final_price_pln) : ''}</td>
          <td>${l.outcome === 'sold' ? '' : reasonLabel(l.unsold_reason)}</td>
          <td>${l.source_pdf ? `<a target="_blank" rel="noopener" href="${l.source_pdf}">PDF</a>` : ''}</td>
        </tr>`,
      )
      .join('');
    const summary = priceSummary(active, prior);
    injectPanel({
      watchKey: prop.key,
      watchMeta: {
        addr: `${prop.street} ${prop.building}${prop.apt ? '/' + prop.apt : ''}`,
        kind: prop.kind,
        detail_url: location.href,
        city: prop.city || site.city,
      },
      title: t('panel.title', {
        addr: `${prop.street} ${prop.building}${prop.apt ? '/' + prop.apt : ''}`,
      }),
      body: `
        ${summary}
        <table class="zgm-ext-history">
          <thead><tr>
            <th>${t('col.date')}</th>
            <th>${t('col.kind')}</th>
            <th>${t('col.start_price')}</th>
            <th>${t('col.price_per_m2')}</th>
            <th>${t('col.outcome')}</th>
            <th>${t('col.final')}</th>
            <th>${t('col.reason')}</th>
            <th>${t('col.src')}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
    });
  }

  function priceSummary(active, prior) {
    const t = window.ZGM_I18N.t;
    if (!active || prior.length === 0) return '';
    const first = prior[0];
    const startPrice = active.starting_price_pln;
    if (!first?.starting_price_pln || !startPrice) return '';
    const delta = startPrice - first.starting_price_pln;
    const pct = ((delta / first.starting_price_pln) * 100).toFixed(1);
    const sign = delta >= 0 ? '+' : '−';
    const unsoldCount = prior.filter((l) => l.outcome === 'unsold').length;
    const key = prior.length === 1 ? 'panel.summary_one' : 'panel.summary_many';
    let html = `<p class="zgm-ext-summary">${t(key, {
      n: prior.length,
      unsold: unsoldCount,
      ask: fmtPLN(startPrice),
      date: first.date,
      first: fmtPLN(first.starting_price_pln),
      sign,
      delta: fmtPLN(Math.abs(delta)),
      pct: Math.abs(Number(pct)).toFixed(1),
    })}</p>`;
    const area = active.area_m2 ?? first.area_m2;
    if (area) {
      const askM2 = Math.round(startPrice / area);
      const firstM2 = Math.round(first.starting_price_pln / area);
      const deltaAbs = Math.abs(askM2 - firstM2);
      html += `<p class="zgm-ext-summary">${t('panel.summary_m2', {
        ask_m2: fmtPerM2(startPrice, area),
        first_m2: fmtPerM2(first.starting_price_pln, area),
        sign,
        delta_m2:
          new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(
            deltaAbs,
          ) + ' zł/m²',
      })}</p>`;
    }
    return html;
  }

  function injectPanel({ title, body, watchKey, watchMeta }) {
    const t = window.ZGM_I18N.t;
    const wrap = document.createElement('aside');
    wrap.className = 'zgm-ext-panel';
    wrap.innerHTML = `
      <div class="zgm-ext-panel-head">
        <h3>${title}</h3>
        ${watchKey ? `<button type="button" class="zgm-ext-watch" data-key="${watchKey}">…</button>` : ''}
      </div>
      ${body}
      <p class="zgm-ext-footer">
        ${t('panel.footer_data')}
        <a target="_blank" rel="noopener" href="https://github.com/110kc3/zgm-gliwice">110kc3/zgm-gliwice</a>
      </p>`;
    const target = site.injectTarget() || document.body;
    target.insertBefore(wrap, target.firstChild);

    if (watchKey) {
      const btn = wrap.querySelector('.zgm-ext-watch');
      const refresh = async () => {
        const watched = await window.ZGM_WATCH.isWatched(watchKey);
        btn.textContent = watched
          ? '★ ' + t('watch.button.remove')
          : '☆ ' + t('watch.button.add');
        btn.classList.toggle('zgm-ext-watch-on', watched);
      };
      refresh();
      btn.addEventListener('click', async () => {
        const watched = await window.ZGM_WATCH.isWatched(watchKey);
        if (watched) await window.ZGM_WATCH.unwatch(watchKey);
        else await window.ZGM_WATCH.watch(watchKey, watchMeta || {});
        refresh();
      });
      window.ZGM_WATCH.onChange(refresh);
    }
  }


  function currentListing(prop) {
    if (!prop || !prop.listings.length) return null;
    return (
      prop.listings.find((l) => l.outcome === 'active') ||
      prop.listings
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] ||
      null
    );
  }

  function roundLabel(n) {
    if (!n) return null;
    return window.ZGM_I18N.t('chip.round', { r: String(n) });
  }

  function fmtArea(a) {
    if (a == null) return null;
    return (
      new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(a) +
      ' m²'
    );
  }

  function buildStatsChip(prop) {
    const t = window.ZGM_I18N.t;
    const l = currentListing(prop);
    if (!l) return null;
    const area = l.area_m2 ?? prop.area_m2 ?? null;
    const parts = [];
    const rl = roundLabel(l.round);
    if (rl) parts.push(rl);
    if (l.starting_price_pln != null) parts.push(fmtPLN(l.starting_price_pln));
    if (area != null) parts.push(fmtArea(area));
    if (l.starting_price_pln != null && area)
      parts.push(fmtPerM2(l.starting_price_pln, area));
    if (l.date) parts.push(`${t('popup.label.auction')} ${l.date}`);
    if (!parts.length) return null;
    const chip = document.createElement('div');
    chip.className = 'zgm-ext-infochip zgm-ext-stats';
    chip.textContent = parts.join('  ·  ');
    return chip;
  }

  function buildDatesChip(activeListing) {
    const t = window.ZGM_I18N.t;
    const parts = [];
    if (activeListing?.wadium_deadline) {
      parts.push(`${t('popup.label.wadium')}: ${activeListing.wadium_deadline}`);
    }
    if (activeListing?.viewing_date) {
      parts.push(`${t('popup.label.viewing')}: ${activeListing.viewing_date}`);
    }
    if (!parts.length) return null;
    const chip = document.createElement('div');
    chip.className = 'zgm-ext-infochip';
    chip.textContent = parts.join('  ·  ');
    return chip;
  }

  function makeBadge({ kind, text }) {
    const el = document.createElement('div');
    el.className = `zgm-ext-badge zgm-ext-${kind}`;
    el.textContent = text;
    return el;
  }

  function buildTooltip(prop, fallbackArea) {
    const t = window.ZGM_I18N.t;
    const tip = document.createElement('div');
    tip.className = 'zgm-ext-tooltip';
    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>${t('col.date')}</th>
          <th>${t('col.start_price')}</th>
          <th>${t('col.price_per_m2')}</th>
          <th>${t('col.outcome')}</th>
          <th>${t('col.note')}</th>
        </tr>
      </thead>
      <tbody>
      ${prop.listings
        .filter(isPriorHistory)
        .map(
          (l) => `
          <tr class="zgm-ext-row-${l.outcome}">
            <td>${l.date ?? '?'}</td>
            <td>${fmtPLN(l.starting_price_pln)}</td>
            <td>${fmtPerM2(l.starting_price_pln, l.area_m2 ?? prop.area_m2 ?? fallbackArea)}</td>
            <td>${outcomeLabel(l)}</td>
            <td>${noteCell(l)}</td>
          </tr>`,
        )
        .join('')}
      </tbody>`;
    tip.appendChild(table);
    return tip;
  }

  function fmtPLN(n) {
    if (n == null) return '—';
    return (
      new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n) +
      ' zł'
    );
  }

  function fmtPerM2(price, area) {
    if (price == null || area == null || area === 0) return '—';
    const v = Math.round(price / area);
    return (
      new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(v) +
      ' zł/m²'
    );
  }

  function outcomeLabel(l) {
    const t = window.ZGM_I18N.t;
    if (l.outcome === 'sold') return t('outcome.sold');
    if (l.outcome === 'unsold') return t('outcome.unsold');
    if (l.outcome === 'no_winner') return t('outcome.no_winner');
    return l.outcome;
  }

  function reasonLabel(reason) {
    const t = window.ZGM_I18N.t;
    if (!reason) return '';
    return t('reason.' + reason, { default: reason });
  }

  function kindLabel(kind) {
    const t = window.ZGM_I18N.t;
    if (!kind) return '';
    return t('kind.' + kind);
  }

  function noteCell(l) {
    const t = window.ZGM_I18N.t;
    if (l.outcome === 'sold') {
      return t('outcome.sold_for', { price: fmtPLN(l.final_price_pln) });
    }
    return reasonLabel(l.unsold_reason);
  }
})();
