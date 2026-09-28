Status: ready-for-agent

# Add ThaiWater canal water-level as a Related condition

## Problem Statement

When BMA's road-water-level sensor feed fails to load (`โหลด BMA ไม่สำเร็จ`), every
road that depended only on a Sensor report loses its point entirely for that
refresh cycle. A driver checking the map during exactly the kind of urgent
situation that made them check it in the first place — BMA being down — sees
less data, not more context, with no alternative signal to fall back on.
Separately, even when BMA is up, a driver has no way to see the broader
water-level picture (is a nearby canal rising?) beyond the handful of discrete
report pins already on the map.

## Solution

Add a fourth data feed, ThaiWater TWA's canal water-level API, surfaced as a
**Related condition** (see `CONTEXT.md`) — a new category, deliberately
outside the Sensor/Event/Citizen report family. It carries no Passability
status, never feeds `mergeCorroboration` or a route verdict, and is shown
unconditionally alongside reports rather than only appearing when BMA fails.
A persistent sidebar section on the main map page (a list, not map pins)
shows the nearest canal water-level stations to the current view, each with
its current level and reading time, framed with an explicit disclaimer that
this is context, not a road-status report. `sources.html` gets a mirrored
card following the existing BMA/Longdo/Traffy pattern.

## User Stories

1. As a driver, I want to see nearby canal water levels even when BMA's
   sensor feed is down, so that I'm not left with strictly less information
   during exactly the situation that made me check the map.
2. As a driver, I want canal water-level data visible at all times, not only
   when BMA fails, so that it's a normal, discoverable part of the map
   rather than a mysterious panel that appears and disappears.
3. As a driver, I want the canal water-level panel to clearly say it isn't a
   road-status report, so that I don't mistake a rising-water reading for a
   Passability verdict on a specific road.
4. As a driver, I want the stations shown to be the ones nearest my current
   map view (or the road I searched), so that a wall of unrelated station
   names across all of Bangkok doesn't bury the ones that actually matter to
   me right now.
5. As a driver, I want each station's reading to include how recent it is,
   so that I can judge whether it's still meaningful.
6. As a driver, I want the app to keep working normally (BMA, Longdo/iTIC,
   Traffy Fondue, cameras) if the ThaiWater fetch fails, so that one more
   external source failing never breaks the whole map.
7. As a driver, I want canal water-level data to have zero effect on route
   verdicts, freshness filtering, or report merging, so that adding it can't
   accidentally change how existing flood reports are evaluated.
8. As a visitor to the data-sources/freshness page, I want a fourth status
   section for this feed (mirroring the existing BMA/Longdo/Traffy cards),
   so that I can judge its freshness and reliability the same way as the
   other three.
9. As a visitor to the data-sources page, I want an explicit note that this
   feed relies on ThaiWater's public undocumented fallback API key rather
   than a registered key of our own, so that I understand its reliability
   caveat the same way the Traffy Fondue card already discloses its
   undocumented-endpoint caveat.
10. As a maintainer, I want the nearest-station selection logic covered by
    an automated test, so that a future change to the sorting/limit logic
    can't silently start showing the wrong stations without a test failing.
11. As a maintainer, I want the raw ThaiWater response parsing/cleaning
    logic (dropping malformed rows) covered by an automated test, following
    the same pattern already established for the camera CSV cleaner, so
    that a schema change or malformed row can't silently corrupt what's
    shown.
12. As a maintainer, I want it to be unambiguous in the code and the domain
    glossary that a Related condition can never be treated as a report, so
    that a future feature (e.g. a new merge rule) can't accidentally start
    treating canal levels as report evidence.

## Implementation Decisions

- **New source module function**: `loadThaiWaterCanal()`, added to
  `window.FloodData` in `data.js` alongside `loadBMA()` / `loadLongdo()` /
  `loadTraffy()`, following the same `async function` shape and the same
  `Promise.allSettled`-friendly failure contract (a rejection is caught by
  the caller, degrades independently, never throws past its own call site).

- **Endpoint**: ThaiWater TWA's public API,
  `https://twa-api-public.thaiwater.net/v2/waterlevel/canal` — canal water
  level, the direct proxy for "is water rising near roads," per
  `.scratch/data-source-ideas/notes.md`'s 2026-09-27 investigation.
  **Corrected during implementation of ticket 01**: the originally-assumed
  `/v2/waterlevel/canal/list` is a paginated, 10-rows-per-page endpoint aimed
  at a table UI; `/v2/waterlevel/canal` (no `/list` — ThaiWater's own
  `CANAL_MAP` route) returns the full, unpaginated set as GeoJSON grouped by
  basin id (253 Bangkok-scoped stations after filtering), which is what a
  "nearest stations to here" feature actually needs.
  `/v2/waterlevel-discharge/list` may be added as a secondary signal if it
  turns out easy to fold in during implementation; dam/river-level endpoints
  (`large-dam/daily/list`, `waterlevel/list`) are explicitly out of scope —
  they answer a river/dam-overflow question on a multi-day timescale, not
  this app's "can I drive on this road right now" scope.
  CORS-open, confirmed live. Requires ThaiWater's public fallback `x-api-key`
  (confirmed live: `TPSXrHRvTHeVT2Lygq6YeTqqAm4xZ72x`, the exact string
  ThaiWater's own official JS bundle falls back to for anonymous users) as a
  request header — same undocumented-but-public category as Traffy's
  endpoint (ADR-0001), and worth its own ADR (see Further Notes, ticket 03).
  **Response schema (confirmed live)**: a GeoJSON `Feature` per station —
  `geometry.coordinates` in `[lng, lat]` order; `properties.measureValue`
  (level in meters), `properties.measureAt` (ISO timestamp with `+07:00`
  offset), `properties.station.id`/`properties.station.station` (name).

- **New data shape — deliberately not a report point**: a station is
  `{ key, label, lat, lng, levelM, updated }`. No `status` field, no
  `depthCm`, no `source` field shaped like a report's — this is intentional:
  it must be structurally impossible for a station to be passed into
  `mergeCorroboration`, ranked by `STATUS_RANK`, or included in
  `renderRoute()`'s verdict calculation just by having a compatible shape.
  `loadThaiWaterCanal()` returns `{ stations, stationCount }`.

- **Nearest-station selection**: a new pure function,
  `nearestStations(stations, lat, lng, limit)`, sorts by distance (reusing
  the existing `distanceMeters` haversine helper in `data.js`, currently
  private to `mergeCorroboration` — exported for reuse here) and returns the
  closest `limit` stations. Called with the map's current view center (or
  the searched road's location, when a search is active) and a small fixed
  `limit` — exact number is an implementation-time UI-density decision, not
  fixed here, but should stay small (a handful, not dozens).

- **Rendering — main map page**: a new, always-visible sidebar panel in
  `index.html` (a new `.panel` alongside the existing route/search panels),
  populated by `app.js`. Renders as a list of station name + water level +
  reading age — never as map pins, keeping it visually and structurally
  distinct from report markers/Passability dots. The panel's header/subtitle
  carries an explicit, unmissable disclaimer that this is contextual water-
  level data, not a road-status report — matching the caution framing
  Citizen reports already carry, but stronger, since this has no
  Passability status at all rather than a capped one.

- **Rendering — data-sources page**: a fourth card in `sources.js`
  (`renderCard` or a variant of it), following the exact pattern of the
  existing BMA/Longdo/Traffy cards, including the same kind of caveat note
  Traffy's card already has (`citizen-note` class) — here noting reliance on
  ThaiWater's public fallback key rather than a registered one.

- **Failure handling**: added to the existing `Promise.allSettled` calls in
  both `app.js`'s `refreshAll()` and `sources.js`'s `refresh()`, alongside
  BMA/Longdo/Traffy. A ThaiWater failure degrades independently — the panel
  shows an empty/error state, the existing failure-note pattern
  (`app.js`'s `setStatusLine`, `sources.js`'s `statusEl`) gains "ThaiWater"
  to its failure list — and nothing else in the app is affected.

- **No change to `mergeCorroboration`, `STATUS_RANK`, `classify`, or
  `renderRoute()`** — this feature is additive/visual only, enforced
  structurally by the station shape above, not just by convention.

## Testing Decisions

- **What makes a good test here**: test the two pieces of real logic —
  nearest-station selection, and response parsing/cleaning — against
  synthetic data. Don't test live network calls, DOM rendering, or the
  sidebar panel/card; consistent with this codebase's established stance
  (see the Traffy Fondue and Camera pin specs) of testing pure logic only.

- **New test seams**:
  - `nearestStations(stations, lat, lng, limit)` — cover: a station list
    longer than `limit` returns exactly the closest `limit`, in distance
    order; a list shorter than `limit` returns all of them; ties/equal
    distances don't throw.
  - A pure parsing/cleaning function extracted from `loadThaiWaterCanal()`
    (name TBD at implementation time, mirroring `parseCameraCsv`'s role for
    the camera CSV) — cover: a well-formed row parses correctly; a row with
    missing/non-numeric lat, lng, or level is dropped; a row with an
    out-of-Bangkok-range coordinate is dropped (reusing the same kind of
    bounding-box check `data.js` already applies elsewhere, e.g. `inBangkok`
    / `BKK_BBOX`).

- **Prior art**: `data.test.js`'s existing tests (`capCitizenSeverity`,
  `mergeCorroboration`) and `scripts/update-cameras.test.js`'s
  `parseCameraCsv` tests are the direct precedent — pure function, synthetic
  input, `node:test`/`node:assert`, no network/DOM.

## Out of Scope

- GISTDA Disaster Platform — a separate, still-unresolved lead (needs an
  API-key registration + live test before it can even be verdicted). Logged
  as its own follow-up in `.scratch/data-source-ideas/notes.md`, starting
  with a `/wizard`-style human registration step, not part of this spec.
- `waterlevel/list` (river stations) and `large-dam/daily/list` (dam
  levels) — different flood mechanism (river/dam overflow, multi-day
  timescale), not relevant to immediate road passability.
- Any change to Passability status, depth classification, route verdicts,
  freshness filtering, or `mergeCorroboration` — this feature is purely
  additive/visual, structurally prevented from affecting any of these by
  the station data shape.
- Any threshold-based "is this dangerous" interpretation of a canal level
  (e.g. a red/normal badge) — a station shows its raw reading and age only;
  adding a derived risk judgment would effectively give it a Passability
  status by another name, which `CONTEXT.md`'s "Related condition"
  definition explicitly rules out.
- The bug where a Traffy Fondue report's photo appears to show daylight
  conditions inconsistent with its reported timestamp — a separate,
  already-identified `/diagnosing-bugs` thread, not part of this spec.

## Further Notes

- See `CONTEXT.md`'s "Related condition" entry (added during this feature's
  `/grill-with-docs` session) for the term's exact definition and boundary
  against the Sensor/Event/Citizen report family.
- A follow-up ADR is expected, mirroring
  `docs/adr/0001-traffy-fondue-undocumented-endpoint.md`: using ThaiWater's
  undocumented public fallback API key (rather than a registered key of our
  own) is a real, surprising-without-context, hard-to-reverse-if-ThaiWater-
  changes-it trade-off. Not written yet — should be drafted alongside or
  immediately after implementation, once the exact key-usage mechanics are
  confirmed against a live request.
- `.scratch/data-source-ideas/notes.md` is the primary source for why
  ThaiWater was chosen over every other candidate investigated on
  2026-09-27 (DOH, TMD, BMA rainfall/canal/flood-monitoring pages, Longdo,
  GISTDA, Google Flood Hub, Windy) — all ruled out as auth-gated,
  CORS-blocked, key-gated-and-unverified, or wrong data shape.
