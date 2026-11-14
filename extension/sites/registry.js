
(function () {
  if (typeof window === 'undefined') return;
  const adapters = [];

  function register(adapter) {
    adapters.push(adapter);
  }

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
