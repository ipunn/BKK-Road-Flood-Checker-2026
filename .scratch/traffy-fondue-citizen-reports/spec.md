Status: done

# Add Traffy Fondue as a Citizen report source

## Problem Statement

Drivers using the flood map only see roads where BMA has a fixed sensor or
where the Longdo/iTIC feed has an active event. Many real, currently-flooded
roads — including major arterials like ถ.เพชรบุรีตัดใหม่ — have neither, so
they silently don't appear on the map even while flooded. A driver checking
their route sees "no report" and cannot tell whether that means "actually
clear" or "just not instrumented here."

## Solution

Add a third live source, Traffy Fondue (BMA/NSTDA's official public
issue-reporting channel), so a road with citizen-submitted flood reports shows
up even without sensor or event-feed coverage. Because a single citizen
submission isn't independently verified the way a sensor reading is, its
Passability status is capped at caution — it can never by itself produce a
blocked verdict. Reports that overlap in place and time with each other or
with a Sensor report / Event report are merged into one marker instead of
cluttering the map with duplicate pins for the same real event.

## User Stories

1. As a driver checking a route, I want to see citizen-reported floods on
   roads with no BMA sensor or Longdo event coverage, so that I don't
   mistake "no data" for "confirmed clear."
2. As a driver, I want a citizen-only report to never show as "blocked," so
   that a single unverified submission can't cause me to abandon a route
   that's actually still passable.
3. As a driver, I want to see when a citizen report agrees with a nearby
   sensor or event report, so that I trust the flagged severity more.
4. As a driver, I want overlapping citizen reports of the same flood spot
   merged into one marker, so that the map doesn't look cluttered or
   contradictory at exactly the spots citizen reports matter most.
5. As a driver, I want a citizen report to stop appearing once it's marked
   resolved or goes stale, so that the map doesn't show outdated hazards.
6. As a driver, I want a citizen report's status to still expire on a
   timer even if never marked resolved, so that a stuck/abandoned ticket
   doesn't permanently block a road on the map.
7. As a driver tapping a merged marker, I want to see each contributing
   report (source, age, depth if any) listed as evidence, so that I can
   judge credibility myself rather than trust a single opaque dot.
8. As a driver, I want citizen reports visually distinguishable from
   sensor/event reports on the map and road list, so that I know at a
   glance which claims are sensor-confirmed and which aren't.
9. As a user of the route builder, I want a route's overall verdict
   ("ผ่านได้" / "ผ่านได้แต่ระวัง" / "ผ่านไม่ได้") to correctly reflect a
   capped citizen report the same way it already reflects sensor/event
   reports, so that route verdicts stay consistent regardless of source mix.
10. As a visitor to the data-sources/freshness page, I want a third status
    card for the Citizen report source (mirroring the existing BMA and
    Longdo/iTIC cards: point count, newest/oldest age, status breakdown),
    so that I can judge this source's freshness the same way as the others.
11. As a visitor to the data-sources page, I want an explicit note that this
    source's endpoint is unofficial/undocumented and best-effort, so that I
    understand it may be less reliable than the two documented feeds.
12. As a driver, I want the app to keep working normally (showing BMA and
    Longdo/iTIC data) if the Traffy Fondue fetch fails, so that one flaky
    unofficial source never breaks the whole map.
13. As a driver, I want only flood-category Traffy reports shown, so that
    unrelated civic issues (potholes, trash, streetlights) don't clutter a
    flood-passability map.
14. As a maintainer, I want the merge/corroboration logic to be a single
    reusable rule applied consistently across all three source pairings
    (citizen↔sensor, citizen↔event, citizen↔citizen), so that there's one
    place to reason about "same real-world flood point," not three
    near-duplicate implementations.
15. As a maintainer, I want the Citizen report severity cap and merge logic
    covered by automated tests, so that a future refactor can't silently
    let a citizen report produce a blocked verdict or stop merging
    duplicates without a test failing.

## Implementation Decisions

- **New source module function**: `loadTraffy()`, added to `window.FloodData`
  in `data.js` alongside the existing `loadBMA()` / `loadLongdo()`, following
  the same shape (`async function` returning `{ points, ... }`, called via
  `Promise.allSettled` from `app.js`/`sources.js` so a Traffy failure degrades
  independently, exactly like a BMA or Longdo failure already does).

- **Endpoint**: `https://publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2`
  — unauthenticated, CORS-open GeoJSON `FeatureCollection`. Per
  [ADR-0001](../../docs/adr/0001-traffy-fondue-undocumented-endpoint.md), this
  is deliberately the undocumented endpoint the public Traffy map itself uses,
  not the documented, auth-gated Exchange API (which cannot be called from a
  static, no-backend client). Coordinates arrive as GeoJSON `[lng, lat]` order
  — must be swapped to this app's existing `{ lat, lng }` point shape.

- **Category filter**: client-side, keep only features whose `properties.type`
  / `properties.problem_type_fondue` includes `"น้ำท่วม"` — same client-side
  filtering pattern `loadLongdo()` already uses for `icon === "flood"`. No
  other Traffy issue categories are included.

- **Severity cap**: a Citizen report's classified status is capped at
  `yellow` — if the underlying `classify()` result would be `red` (e.g. report
  text says "ผ่านไม่ได้"), it downgrades to `yellow`. Implemented as a small
  pure wrapper around the existing `classify()` function, not a change to
  `classify()` itself (which stays source-agnostic; Sensor/Event reports keep
  their full severity range).

- **Closure**: a standalone Citizen report point is dropped from the active
  set when *either* condition is met: its Traffy status resolves
  (`state`/`state_type_latest` indicates finished/not-applicable), *or* it
  exceeds a fixed fallback expiry from its `timestamp`. This mirrors
  `loadBMA()`'s existing `end_flood` OR staleness pattern (`data.js`) rather
  than introducing a third distinct closure shape. Same fallback duration as
  the existing `LONGDO_FALLBACK_MS` (3h) — reused, not a new constant.

- **Corroboration/merge — one shared rule, applied across all source pairs**:
  a new pure function, `mergeCorroboration(points)`, run once after BMA,
  Longdo, and Traffy points are all combined (in `app.js`'s `refreshAll()` and
  `sources.js`'s `refresh()`, replacing the current flat concatenation).
  Two points merge into one marker when they are within ~300m of each other
  *and* both fall within the existing freshness window
  (`FD.STALE_WARN_MIN`, currently 60min). This single rule covers all three
  practical cases from the design discussion: a Citizen report near an active
  Sensor/Event report merges into it as corroborating evidence; two or more
  nearby Citizen reports with no sensor coverage merge with each other. The
  merged point's status/depth is the worst (highest `STATUS_RANK`) among its
  contributors, still subject to the Citizen-report cap if a Citizen report is
  among the worst; its popup/detail view lists every contributing report
  (source, age, depth) rather than only the winning one.

- **Visual distinction**: Citizen report markers/list rows get a distinct
  visual treatment from Sensor/Event reports, communicating "not
  sensor-confirmed" as a separate dimension from the red/yellow/green/gray
  Passability status. Exact styling (e.g. a dashed marker ring, per the
  existing Duty Board stamp/tag vocabulary in `DESIGN.md`) is an
  implementation-time decision within that existing design system, not fixed
  here.

- **Route verdict**: no change to `renderRoute()`'s logic (`app.js`) — it
  already computes "worst status among selected points" via `STATUS_RANK`,
  which correctly reflects a capped Citizen report without modification,
  since the cap happens upstream at classification time.

- **`sources.html` / `sources.js`**: add a third source card for Citizen
  report, following the exact pattern of the existing BMA/Longdo cards
  (`renderCard` in `sources.js`) — point count, newest/oldest report age,
  status breakdown. Card copy includes a short note that this endpoint is
  unofficial/undocumented (per ADR-0001) and best-effort, distinct from the
  documented BMA and Longdo/iTIC feeds.

## Testing Decisions

- **What makes a good test here**: test the pure, source-agnostic logic —
  severity capping and the corroboration/merge rule — against synthetic point
  data. Don't test live network calls, DOM rendering, or Leaflet marker
  placement; those are either already untested elsewhere in this codebase or
  not practically testable without a browser harness this project doesn't
  have.

- **New test seam**: this repo currently has no test infrastructure at all
  (confirmed: no `package.json`, no test runner, no build step —
  `README.md` states "no build step" as a deliberate constraint). Introduce
  Node's built-in `node:test` + `node:assert` (zero new dependencies,
  `node --test`), run against `data.js`'s exported pure functions the same
  way `classify()`/`parseDepthCm()` are already structured as testable,
  side-effect-free exports on `window.FloodData`. This is a dev-only local
  command; it changes nothing about what ships to the browser or the site's
  no-build-step deployment.

- **Modules under test**: the severity-cap wrapper (citizen `red` → `yellow`)
  and `mergeCorroboration(points)` — proximity+recency merge behavior,
  including: two points that should merge, two that shouldn't (too far /
  too old), and a three-way merge producing one marker with all contributors
  listed.

- **Prior art**: none in this codebase yet — this establishes the pattern.
  `data.js`'s existing pure functions (`classify`, `parseDepthCm`,
  `ageMinutes`) are the natural next candidates to backfill tests for, but
  that's out of scope here.

## Out of Scope

- CCTV camera feeds — logged as a separate follow-up idea from this design
  discussion, not part of this spec.
- Any Traffy Fondue issue category other than flood (`น้ำท่วม`) — no road
  damage, potholes, or other civic-issue types.
- A server-side proxy or credentialed access to Traffy's documented Exchange
  API — explicitly rejected in favor of the unauthenticated endpoint per
  ADR-0001; only revisit if that endpoint stops working.
- Backfilling tests for existing untested code (`loadBMA`, `loadLongdo`,
  `classify`, rendering logic) — only the new logic introduced by this
  feature is tested.
- Any change to the BMA or Longdo/iTIC closure/classification logic — they
  keep their current behavior unchanged.

## Further Notes

- Traffy's undocumented endpoint (`teamchadchart-stat-api/geojson/v2`) is
  capped at roughly 300 features server-side with unclear pagination and
  unconfirmed server-side type filtering (confirmed via live inspection) —
  treat as "recent tickets," not a full historical dump, consistent with how
  this app already only shows currently-active reports from its other two
  sources.
- See `CONTEXT.md` for the "Sensor report" / "Event report" / "Citizen
  report" / "Corroboration" / "Passability status" vocabulary used throughout
  this spec, and `docs/adr/0001-traffy-fondue-undocumented-endpoint.md` for
  why the undocumented endpoint was chosen over the documented one.
