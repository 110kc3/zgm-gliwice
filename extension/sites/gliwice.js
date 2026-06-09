// Gliwice site adapter — zgm-gliwice.pl (WordPress + Elementor).
//
// Listing-index pages are the four ZGM auction-board paths; their cards are
// Elementor image-boxes whose text looks like
//   "<address> - DD.MM.YYYY r. <area> m² - <price> zł".
// Detail pages have slug URLs like /zygmunta-starego-29-4-23-03-2026-r/ and a
// <title> that starts with the address before the date dash.

(function () {
  if (!window.ZGM_SITES) return;

  const LISTING_RE =
    /^\/(przetargi-lokale-mieszkalne|przetargi-garaze|przetargi-lokale-uzytkowe|wykaz-lokali-przeznaczonych-do-sprzedazy-w-przetargu)\/?/;
  const DETAIL_RE = /^\/[a-z0-9-]+-\d{2}-\d{2}-\d{4}-r\/?$/;

  // "…m² - <price> zł" → { area_m2, price_pln } (either may be null).
  function parseCardFigures(text) {
    const m = /(\d{1,4}(?:[,.]\d{1,3})?)\s*m[²2]\s*-\s*([\d.,\s]+)\s*z[łl]/i.exec(text);
    if (!m) return { area_m2: null, price_pln: null };
    const area = Number(m[1].replace(',', '.'));
    const price = Number(m[2].replace(/[.\s]/g, '').replace(',', '.'));
    return {
      area_m2: Number.isFinite(area) ? area : null,
      price_pln: Number.isFinite(price) ? Math.round(price) : null,
    };
  }

  window.ZGM_SITES.register({
    city: 'gliwice',
    hostMatches: ['zgm-gliwice.pl'],

    isListingIndex: (path) => LISTING_RE.test(path),
    isDetail: (path) => DETAIL_RE.test(path),

    collectCards() {
      const out = [];
      const boxes = document.querySelectorAll('.elementor-image-box-content');
      for (const box of boxes) {
        const text = box.textContent.replace(/\s+/g, ' ').trim();
        const m = /^(.+?)\s+-\s+\d{2}\.\d{2}\.\d{4}\s*r\./.exec(text);
        if (!m) continue;
        const addrRaw = m[1].trim();
        const address = window.ZGM_NORMALIZE.parseAddress(addrRaw);
        if (!address) continue;
        const { area_m2, price_pln } = parseCardFigures(text);
        out.push({
          element: box,
          address,
          addressRaw: addrRaw,
          area_m2,
          price_pln,
          descTarget: box.querySelector('.elementor-image-box-description'),
        });
      }
      return out;
    },

    detailAddress() {
      // Title is authoritative; slug fallback only.
      let guess = null;
      const titleM = /^([^–—\-]+?)\s+[–—-]/.exec(
        document.title.replace(/&#8211;/g, '–'),
      );
      if (titleM) guess = titleM[1].trim();
      let address = guess ? window.ZGM_NORMALIZE.parseAddress(guess) : null;
      if (!address) {
        guess = window.ZGM_NORMALIZE.addressFromSlug(location.pathname);
        address = guess ? window.ZGM_NORMALIZE.parseAddress(guess) : null;
      }
      if (!address) return null;
      return { address, addressRaw: guess };
    },

    injectTarget() {
      return (
        document.querySelector('.page-content-container') ||
        document.querySelector('main') ||
        document.body
      );
    },
  });
})();
