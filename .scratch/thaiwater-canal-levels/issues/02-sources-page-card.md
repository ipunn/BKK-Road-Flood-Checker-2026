# 02: Mirror the ThaiWater canal feed on the data-sources page

**What to build:** A visitor to `sources.html` sees a fourth status card,
"ThaiWater canal water level," alongside the existing BMA, Longdo/iTIC, and
Traffy Fondue cards — same ONLINE/error treatment, same freshness stats
shape, plus a note that this feed relies on ThaiWater's public fallback API
key rather than a registered key of our own.

**Blocked by:** 01 (needs `loadThaiWaterCanal()` to exist)

**Status:** ready-for-agent

- [ ] `sources.js`'s `refresh()` adds `FD.loadThaiWaterCanal()` to its
      existing `Promise.allSettled` call alongside BMA/Longdo/Traffy.
- [ ] A fourth card is rendered via `renderCard` (or a variant of it),
      following the exact pattern of the existing three cards — station
      count and freshness-style stats appropriate to a station reading
      rather than a report (no red/yellow/green/gray Passability breakdown,
      since stations carry no Passability status).
- [ ] The card includes a caveat note (mirroring Traffy's `citizen-note`)
      that this feed uses ThaiWater's public undocumented fallback API key,
      not a registered key of our own.
- [ ] A ThaiWater fetch failure renders the same error-card state the other
      three sources already use, and is included in the page's overall
      "some source failed to load" status line.
- [ ] No change to the existing BMA/Longdo/Traffy cards' rendering or logic.
