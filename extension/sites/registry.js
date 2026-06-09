// Per-site DOM adapter registry. See EXPANSION.md §1.6.
//
// Each city ships a small object describing *its website's DOM* — what counts
// as a listing-index page, what counts as a detail page, how to walk the cards,
// where to inject the history panel. content.js stays generic: on load it picks
// the adapter whose hostMatches contains location.hostname; if none, the
// content-script does nothing.
//
// Adapter contract (all properties required unless noted):
//
//   city:            'gliwice' | 'katowice' | …    — used to namespace the
//                                                    property key for lookup
//                                                    against the merged data.
//   hostMatches:     string[]                      — bare hostnames the adapter
//                                                    applies to (matches the
//                                                    host exactly, or any
//                                                    *.host subdomain).
//   isListingIndex:  (path:string) => boolean
//   isDetail:        (path:string) => boolean
//   collectCards:    () => Card[]                  — only called when
//                                                    isListingIndex is true.
//   detailAddress:   () => DetailAddr | null       — only called when
//                                                    isDetail is true.
//   injectTarget:    () => Element                 — host element for the
//                                                    detail-page sidebar.
//
//   Card shape:
//     {
//       element:     HTMLElement,        // where badge / chip get appended
//       address:     ReturnType<ZGM_NORMALIZE.parseAddress>,
//       addressRaw:  string,             // for panel title / watch meta
//       area_m2:     number | null,      // null when the listing page
//       price_pln:   number | null,      // doesn't surface these
//       descTarget:  Element | null,     // where to insert the inline zł/m²
//                                        // span (null = skip)
//     }
//
//   DetailAddr shape: { address, addressRaw }

(function () {
  if (typeof window === 'undefined') return;
  const adapters = [];

  function register(adapter) {
    adapters.push(adapter);
  }

  // Matches the adapter whose hostMatches contains the current hostname (exact
  // match) or a parent of it (e.g. an adapter listing 'katowice.eu' would also
  // match 'www.katowice.eu', without us having to enumerate every subdomain).
  function findFor(hostname) {
    if (!hostname) return null;
    return (
      adapters.find((a) =>
        a.hostMatches.some(
          (h) => hostname === h || hostname.endsWith('.' + h),
        ),
      ) || null
    );
  }

  window.ZGM_SITES = { register, findFor };
})();
