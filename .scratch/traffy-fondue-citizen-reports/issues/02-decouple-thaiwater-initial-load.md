# 02: Decouple ThaiWater's slow fetch from the main loading overlay

**Status:** done

## Report

"the initial load is quite long now, any suggestion?"

## Measurement

Timed each live endpoint directly (`curl -o /dev/null -w time_total`):

| Source | time_total |
|---|---|
| BMA `sensor_profile` | ~9.1s |
| BMA `flood_notification` | ~8.8s (parallel with the above inside `loadBMA()`) |
| Longdo/iTIC | ~0.26s |
| Traffy Fondue | ~0.66s |
| ThaiWater canal levels | ~12.2s |

`refreshAll()` previously awaited `Promise.allSettled` over all four loaders
before calling `hideLoadingOverlay()` — so the full-screen loading overlay
(`#loading-overlay`, covers the whole map) stayed up for
`max(~9s, ~12s) ≈ 12s` on every first load, even though two of the four
sources return in under a second.

## Fix

Split the single `refreshAll()` into two independent async flows that no
longer await each other:

- `refreshReports()`: `Promise.allSettled` over BMA/Longdo/Traffy only —
  these are the three actual road-report sources, merged via
  `mergeCorroboration()` and rendered to the map/road list/route. Calls
  `hideLoadingOverlay()` on completion, cutting the first-paint wait to
  `max(~9s, ~0.3s, ~0.7s) ≈ 9s` (bounded by BMA alone) instead of ~12s.
- `refreshThaiWater()`: fetches ThaiWater independently and only updates
  `canalStations` / `renderRelatedConditions()` — the Related-conditions
  sidebar panel, which never affects a road's passability status (see
  `CONTEXT.md` "Related condition"), so it was always the safest of the
  four to let arrive late.

`refreshAll()` is kept as a thin wrapper firing both (`refreshReports();
refreshThaiWater();`) so the refresh button and `setInterval` call site in
`main()` didn't need to change.

Added `thaiwaterEverSettled` to distinguish "hasn't fetched yet" from
"fetched and failed" — without it, `renderRelatedConditions()` would flash
its failure message during the several seconds before ThaiWater's slower
fetch resolves. The main status line's failure list only names ThaiWater
once it has actually settled at least once, for the same reason.

## Out of scope / further ideas not implemented here

- BMA itself is the remaining bottleneck (~9s) and is a slow *server*, not
  something this static client can fix. Progressively rendering Longdo/Traffy
  as soon as each resolves (instead of waiting for BMA too) would cut
  perceived first-paint further, at the cost of a more involved refactor to
  `refreshReports()`'s single merge-then-render step — floated to the user
  as a follow-up, not built here.
- Caching BMA's largely-static `sensor_profile` (station metadata, not the
  live readings) client-side was considered but not built — the project's
  README states a deliberate "no cached/mock data" constraint, so this
  would need explicit user sign-off before changing that stance, even for
  metadata that rarely changes.
