Status: ready-for-agent

# Give canal stations a distinct icon and a sourced water-level status color

## Problem Statement

Canal (ThaiWater) stations currently render as the exact same `L.circleMarker`
shape as every other point type on the map — just a smaller circle in a
different flat color. A driver glancing at the map can't tell at a glance
that a given dot is "a canal reading" rather than a road report or a camera
pin. Separately, every canal station shows the same neutral color regardless
of its actual water level, so a driver gets no sense of whether a given
reading is normal or worth attention — even though BMA (the agency that owns
every one of these stations) already publishes its own warning/critical
thresholds for most of them.

## Solution

Give canal stations their own icon (a wave glyph, via a Leaflet `divIcon`,
replacing the current `circleMarker`) so they're never visually confused with
report or camera pins. Add a new, narrower domain concept — **water-level
status** (red / yellow / green / neutral) — derived from each station's
current level against a real warning/critical threshold, hand-sourced from
BMA's own public dashboard (`weather.bangkok.go.th/water`) and keyed by BMA's
station code (present in ThaiWater's own response as `station.stationCode`).
Water-level status is deliberately **not** Passability status: it's scoped
only to canal stations, uses a visually distinct palette from the existing
road-status colors, and — like every other Related condition property —
never feeds a route verdict. Stations with no sourced threshold (BMA doesn't
publish one for roughly a quarter of stations, more common on pumps/
reservoirs/newer points) keep today's neutral fallback color rather than
guessing.

This explicitly revisits — but does not violate — two earlier decisions:
the original `thaiwater-canal-levels` spec's Out-of-Scope note ruling out any
"threshold-based 'is this dangerous' interpretation," and `app.js`'s
`CANAL_MARKER_COLOR` comment explaining why canal was never color-coded. Both
were right given what was known at the time (no threshold data existed
anywhere in the feed or codebase); this spec is justified by newly-sourced,
real, BMA-published thresholds rather than an invented severity guess — the
same category of "now we actually have the data" reversal, not a rejection of
the original caution.

## User Stories

1. As a driver, I want canal stations to look visually distinct from road
   reports and camera pins, so that I don't mistake a canal reading for a
   road-passability marker at a glance.
2. As a driver, I want a canal station's marker color to reflect whether its
   current level is normal, elevated, or critical, so that I get a
   meaningful signal instead of a flat, uninformative color.
3. As a driver, I want a station with no known threshold to show a neutral
   color rather than a guessed green/yellow/red, so that the app never
   implies a safety judgment it can't actually back up.
4. As a driver, I want canal water-level status to remain visually and
   functionally distinct from road Passability status (different palette,
   different icon shape), so that I never confuse "this canal is elevated"
   with "this road is blocked."
5. As a driver, I want the map legend to explain the new canal icon and its
   color meanings, so that I can interpret it without guessing.
6. As a driver, I want water-level status to have zero effect on route
   verdicts, freshness filtering, `mergeCorroboration`, or `STATUS_RANK`, so
   that adding it can't accidentally change how existing flood reports are
   evaluated — consistent with every other Related condition guarantee.
7. As a driver, I want a station's popup to still show its raw reading (as
   today), so that the color is a shortcut, not a replacement for the actual
   number.
8. As a maintainer, I want the level-vs-threshold banding logic
   (`waterLevelStatus`) covered by an automated test against synthetic
   thresholds, so that a future change to the banding rules can't silently
   misclassify a station without a test failing.
9. As a maintainer, I want the canal station shape to keep the property that
   makes it structurally impossible to feed into `mergeCorroboration` or a
   route verdict, so that a new `waterLevelStatus` field can't accidentally
   be read by code that expects a Passability-shaped report.
10. As a maintainer, I want the reversal of the earlier "never color-code
    canal" decision recorded as an ADR, so that a future reader understands
    why this is different from the original caution rather than a
    regression of it.
11. As a maintainer, I want the BMA threshold table's provenance (source URL,
    the fact it was fetched via a summarizing tool rather than verified
    byte-for-byte, and that ~25% of stations have no threshold at all)
    documented alongside the table, so that a future maintainer knows its
    real reliability before trusting or re-syncing it.
12. As a maintainer, I want CONTEXT.md to define "Water-level status" as its
    own term, explicitly distinguished from "Passability status" and
    "Related condition," so that the boundary between the two systems stays
    unambiguous as the codebase grows.

## Implementation Decisions

- **Threshold source**: BMA's public dashboard, `weather.bangkok.go.th/water`
  (สำนักการระบายน้ำ กรุงเทพมหานคร — the same agency that owns all 256
  ThaiWater canal stations this app consumes), lists เตือนภัย (warning) and
  วิกฤติ (critical) meter thresholds per station, keyed by BMA's own station
  code (`WL.XXX.NN` format). ThaiWater's response already carries this same
  code as `properties.station.stationCode` (formatted
  `C00000002-WL.XXX.NN`), so it's the natural join key — no separate mapping
  table between two different code schemes is needed.

- **`parseCanalStations()` (`data.js`) extended**: capture
  `properties.station.stationCode` onto the parsed station object (currently
  only `key`/`label`/`lat`/`lng`/`levelM`/`updated` are extracted). Used
  purely as a lookup key into the threshold table — not shown in the UI.

- **New literal, `CANAL_STATION_THRESHOLDS`** (`data.js`): a hand-curated
  object mapping station code → `{ warningM, criticalM }`, hand-copied from
  the BMA dashboard above for however many of the ~256 stations publish both
  values (estimated ~190; the rest have no entry). This is data, not logic —
  no unit test for the table's contents, only for the lookup/banding function
  around it. Include a comment recording the source URL, the fetch date, and
  the caveat that the source page was read via a summarizing fetch tool
  rather than verified byte-for-byte — spot-check a handful of high-traffic
  stations' numbers against the live dashboard before/while populating this
  table.

- **New pure function, `waterLevelStatus(levelM, thresholds)`** (`data.js`,
  exported on `window.FloodData` alongside `capCitizenSeverity`/`classify`):
  takes a level in meters and a `{ warningM, criticalM }` pair (or
  `undefined`/`null` when no threshold exists) and returns
  `"green" | "yellow" | "red" | null`. Banding: `levelM < warningM` → green;
  `warningM <= levelM < criticalM` → yellow; `levelM >= criticalM` → red;
  no threshold → `null` (never green-by-default). This mirrors BMA's own
  dashboard legend for the same data, rather than inventing a new banding
  convention.

- **Station shape gains `waterLevelStatus`**: `parseCanalStations()` (or
  `loadThaiWaterCanal()`) looks up `CANAL_STATION_THRESHOLDS[stationCode]`
  and calls `waterLevelStatus(levelM, threshold)`, storing the result as
  `station.waterLevelStatus`. Deliberately named `waterLevelStatus`, not
  `status` — a station must never become structurally similar enough to a
  report to be mistaken for one by code that pattern-matches on a `status`
  field (`mergeCorroboration`, `STATUS_RANK`, `classify`, `renderRoute()` are
  all untouched by this feature, same guarantee the original
  `thaiwater-canal-levels` spec established).

- **New palette, `CANAL_STATUS_COLOR`** (`app.js`): a red/yellow/green triple
  visually distinct from the existing `MARKER_COLOR` (`app.js:205`) — same
  hue family (so it still reads as a traffic-light severity scale, matching
  BMA's own dashboard legend), different shade/saturation, so a canal marker
  is never color-identical to a road-status dot even glanced at quickly.
  Exact hex values are an implementation-time detail. The existing
  `CANAL_MARKER_COLOR` (`#4d7a91`) remains the fallback for `null`/unknown
  status.

- **`renderCanalMarkers()` (`app.js`) reworked**: replace the `L.circleMarker`
  with an `L.divIcon` containing an inline SVG wave glyph. The glyph's fill/
  background color is chosen from `CANAL_STATUS_COLOR[s.waterLevelStatus]`,
  falling back to `CANAL_MARKER_COLOR` when `waterLevelStatus` is `null`.
  Popup content is unchanged (station label, raw `levelM` reading, age,
  existing "context, not a road-condition report" disclaimer) — status color
  is a visual shortcut, not a replacement for the number.

- **Map legend (`index.html`)**: add a canal-specific section (separate from
  the existing road-status `.legend` block) showing the wave icon alongside
  its three status colors and the neutral fallback, so canal's meaning is
  documented in the same place road-status colors already are.

- **CONTEXT.md — new term, "Water-level status"**: defined analogously to
  "Passability status" but explicitly scoped to Related conditions only,
  cross-referencing that it's never a Passability status, never a
  `mergeCorroboration` input, and never a route-verdict input — the same
  guarantees "Related condition" already makes, restated for this specific
  derived signal so a future reader can't miss it.

- **New ADR**: records the decision to derive water-level status from
  BMA-sourced thresholds, explicitly referencing and explaining why this
  supersedes the original `thaiwater-canal-levels` spec's Out-of-Scope note
  and the `app.js` `CANAL_MARKER_COLOR` comment — the reversal is justified
  by newly-available, real, sourced threshold data (not present when those
  decisions were made), not a rejection of the original "never guess a
  severity" caution. Also documents the threshold table's maintenance
  posture: hand-curated, no live sync, expected to drift stale over time,
  same best-effort posture as the rest of this app's data sources.

## Testing Decisions

- **What makes a good test here**: test the pure banding logic only —
  `waterLevelStatus(levelM, thresholds)` — against synthetic threshold
  pairs, not the real ~190-row table. Don't test DOM rendering, the `divIcon`
  markup, or the legend; consistent with this codebase's established stance
  (see `data.test.js`) of testing pure logic only, no network/DOM.

- **New test seam**: `waterLevelStatus(levelM, thresholds)` — cover: a level
  below `warningM` returns `"green"`; at/above `warningM` but below
  `criticalM` returns `"yellow"`; at/above `criticalM` returns `"red"`;
  `undefined`/`null` thresholds returns `null` (never defaults to green);
  boundary values (`levelM` exactly equal to `warningM` or `criticalM`) land
  on the documented side of the `<`/`>=` split above.

- **Prior art**: `data.test.js`'s existing `capCitizenSeverity` and
  `parseCanalStations` tests are the direct precedent — pure function,
  synthetic input, `node:test`/`node:assert`, no network/DOM. The new tests
  should sit in the same "ThaiWater canal water-level Related condition"
  section of `data.test.js`.

## Out of Scope

- Any live/automated sync of the BMA threshold table — it's a one-time,
  hand-curated snapshot; keeping it current is a manual, future task, not
  part of this spec.
- Trend-based coloring (rising/falling/stable) — the app has no history of
  prior canal readings anywhere (in-memory state is fully overwritten each
  refresh, no localStorage/IndexedDB/backend), so this isn't feasible
  without adding new persistence, which is out of scope here.
- Changing the road-status legend, `MARKER_COLOR`, or the sidebar `.dot`
  status indicators (`style.css`'s `--stamp-*`) — those stay exactly as they
  are; this spec only adds a new, separate canal legend section.
- Any change to `mergeCorroboration`, `STATUS_RANK`, `classify`,
  `renderRoute()`, freshness filtering, or route verdicts — this feature
  stays additive/visual only, same guarantee the original
  `thaiwater-canal-levels` spec established.
- Camera pins (`loadCameraPins()`) — out of scope; this spec only touches
  canal stations. A future, separate effort could apply the same
  "distinct icon" treatment to camera pins for consistency, but that's not
  part of this work.
- Exact hex values for `CANAL_STATUS_COLOR` and the SVG wave glyph's precise
  shape/sizing — implementation-time visual-design details, not fixed here.

## Further Notes

- See `.scratch/thaiwater-canal-levels/spec.md` and `app.js:38-44` for the
  original "never color-code canal" rationale this spec explicitly revisits
  and justifies overriding — cite both directly in the new ADR.
- BMA threshold research (confirmed via a live ThaiWater API call and a
  fetch of `weather.bangkok.go.th/water`, 2026-09-28): ThaiWater's own API
  has zero threshold fields; the dashboard has no underlying JSON API
  (server-rendered HTML, read via a summarizing fetch tool, not
  independently row-verified) — spot-check before trusting large parts of
  the table verbatim. Example confirmed row: station `WL.RPS.01` (Khlong
  Rangsit Prayunsakdi), warning 1.90m, critical 2.20m.
- CONTEXT.md's "Related condition" entry stays unchanged; "Water-level
  status" is added as a new, separate entry rather than editing that one, to
  avoid disturbing its existing, already-precise wording.
