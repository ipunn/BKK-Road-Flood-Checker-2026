# 02: Mirror the ThaiWater canal feed on the data-sources page

**What to build:** A visitor to `sources.html` sees a fourth status card,
"ThaiWater canal water level," alongside the existing BMA, Longdo/iTIC, and
Traffy Fondue cards — same ONLINE/error treatment, same freshness stats
shape, plus a note that this feed relies on ThaiWater's public fallback API
key rather than a registered key of our own.

**Blocked by:** 01 (needs `loadThaiWaterCanal()` to exist)

**Status:** done

- [x] `sources.js`'s `refresh()` adds `FD.loadThaiWaterCanal()` to its
      existing `Promise.allSettled` call alongside BMA/Longdo/Traffy.
- [x] A fourth card is rendered via a new `renderStationCard` variant of
      `renderCard` — station count and freshness-style stats appropriate to
      a station reading rather than a report (no red/yellow/green/gray
      Passability breakdown, since stations carry no Passability status).
- [x] The card includes a caveat note (mirroring Traffy's `citizen-note`)
      that this feed uses ThaiWater's public undocumented fallback API key,
      not a registered key of our own.
- [x] A ThaiWater fetch failure renders the same error-card state the other
      three sources already use, and is included in the page's overall
      "some source failed to load" status line.
- [x] No change to the existing BMA/Longdo/Traffy cards' rendering or logic.

## Comments

`renderCard` couldn't be reused as-is since it assumes a report's
red/yellow/green/gray Passability breakdown, which stations don't have — a
sibling function `renderStationCard` was added instead, following the same
markup/CSS classes (`source-card`, `source-stats`, `citizen-note`, etc.) so
it's visually consistent with the other three cards. Not visually verified in
a live browser this session — no Claude in Chrome extension connection was
available. Worth a manual look before considering this fully done.
