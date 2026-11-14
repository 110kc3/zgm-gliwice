(function () {
  const POLISH_LOWER = (s) =>
    s
      .toLowerCase()
      .replace(/[ąàá]/g, 'a').replace(/[ćč]/g, 'c').replace(/[ęè]/g, 'e')
      .replace(/[ł]/g, 'l').replace(/[ńñ]/g, 'n').replace(/[óòô]/g, 'o')
      .replace(/[śš]/g, 's').replace(/[żź]/g, 'z');

  const STRIP_LEAD = /^\s*(?:ul\.?|al\.?|pl\.?|os\.?)\s+/i;
  const TRAIL_NOISE = /\s*(?:wraz\b.*|m\.\s*\d+\s*$)/i;
  const ROMAN_OK = /^(I{1,3}|IV|V|VI{0,3}|IX|X)$/i;

  function buildAddress(street, building, apt, warning) {
    const streetNorm = POLISH_LOWER(street).replace(/[^\w]+/g, ' ').trim().replace(/\s+/g, ' ');
    return {
      street,
      street_norm: streetNorm,
      building,
      apt,
      key: `${streetNorm}|${building}|${apt || ''}`,
      warning,
    };
  }

  function parseAddress(raw) {
    if (!raw) return null;
    let s = raw.trim().replace(/\s+/g, ' ');
    s = s.replace(STRIP_LEAD, '');
    s = s.replace(TRAIL_NOISE, '').trim();

    const garageMatch = /^(.+?)\s+(\d+(?:-\d+)?[A-Za-z]?)\s+gara[żz]\s*nr\s*(\d+)$/i.exec(s);
    if (garageMatch) {
      const [, street, building, garageNo] = garageMatch;
      return buildAddress(street, building.toUpperCase(), `garaz-${garageNo}`, null);
    }

    const re =
      /^(.+?)\s+(\d+(?:-\d+)?[A-Za-z]?)(?:\s*[\/\\]\s*([0-9]+[A-Za-z]?|[IVX]+|T[IVX]+|[1-9][Il]))?$/i;
    const m = re.exec(s);
    if (!m) return null;
    const street = m[1].trim();
    const building = m[2].toUpperCase();
    const aptRaw = m[3] || null;
    let warning = null;
    let apt = null;
    if (aptRaw) {
      const ocrSlip = /^([1-9])[Il]$/.exec(aptRaw);
      const ocrTPrefix = /^T(I+|V|X)$/i.exec(aptRaw);
      if (ocrSlip) {
        apt = ocrSlip[1];
        warning = `OCR-quirk: apt '${aptRaw}' interpreted as '${apt}'`;
      } else if (ocrTPrefix) {
        apt = ('I' + ocrTPrefix[1]).toUpperCase();
        warning = `OCR-quirk: apt '${aptRaw}' interpreted as '${apt}'`;
      } else if (ROMAN_OK.test(aptRaw)) {
        apt = aptRaw.toUpperCase();
      } else {
        apt = aptRaw.toUpperCase();
      }
    }
    return buildAddress(street, building, apt, warning);
  }

  function addressFromSlug(pathname) {
    const m = /^\/?([a-z0-9-]+)-(\d{2})-(\d{2})-(\d{4})-r\/?$/i.exec(pathname);
    if (!m) return null;
    const slug = m[1];
    if (/-garaz-nr-/i.test(slug)) {
      const gm = /^(.+?)-(\d+[a-z]?)-garaz-nr-(\d+)$/i.exec(slug);
      if (!gm) return null;
      const [, streetSlug, building, garageNo] = gm;
      const street = streetSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${street} ${building} garaż nr ${garageNo}`;
    }
    const am = /^(.+?)-(\d+[a-z]?)-(\d+[a-z]?)$/i.exec(slug);
    if (am) {
      const [, streetSlug, building, apt] = am;
      const street = streetSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${street} ${building}/${apt}`;
    }
    const am2 = /^(.+?)-(\d+[a-z]?)$/i.exec(slug);
    if (am2) {
      const [, streetSlug, building] = am2;
      const street = streetSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${street} ${building}`;
    }
    return null;
  }

  window.ZGM_NORMALIZE = { parseAddress, addressFromSlug };
})();
