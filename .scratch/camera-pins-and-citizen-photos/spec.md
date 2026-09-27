Status: ready-for-agent

# Add Camera pins and Citizen report photos

## Problem Statement

A driver looking at a flood report — whether a Sensor report, Event report,
or Citizen report — has to trust a classified severity dot with no way to see
the road for themselves. This is sharpest for Citizen reports specifically:
they're already capped at caution severity because a single citizen
submission isn't independently verified, but the driver still has no way to
judge that report's credibility beyond the text description. Separately,
roads with no active report at all (the original motivating case for adding
Citizen reports, e.g. ถ.เพชรบุรีตัดใหม่) still have no way for a driver to
glance at nearby camera coverage even when no one has filed a report yet.

## Solution

Two additions, both purely visual/evidentiary — neither changes a status,
depth, or route verdict:

1. **Camera pin layer**: a toggleable (off by default) map layer showing
   ~234 BMA public traffic-camera locations as their own pins, independent of
   flood reports. Each pin links out to BMA's public viewer so a driver can
   look for themselves — even though (confirmed via research) BMA's system
   has no way to deep-link a specific camera, so every link opens the same
   generic viewer homepage.
2. **Citizen report photos**: Traffy Fondue tickets already include a
   citizen-submitted photo on essentially every report. Show it as a
   thumbnail directly in that report's popup — real photographic evidence for
   the specific report a driver is evaluating, not just a nearby camera.

## User Stories

1. As a driver evaluating a Citizen report, I want to see the photo the
   citizen submitted, so that I can judge the report's credibility myself
   instead of trusting an opaque capped-severity dot.
2. As a driver evaluating a Citizen report that got merged with a
   corroborating Sensor/Event report, I want to still see the citizen's
   photo alongside their entry in the corroboration list, so that real
   evidence isn't hidden just because the point ended up sensor-confirmed.
3. As a driver, I want to tap/click a report photo to see it full-size in a
   new tab, so that I can actually study it without the popup itself
   growing large and pushing other controls off-screen.
4. As a driver on a road with no active report at all, I want to be able to
   toggle on nearby camera locations, so that I have some way to visually
   check the road even when no one has filed a report there.
5. As a driver, I want the camera layer off by default, so that the map's
   initial view stays focused on actual flood reports, not 234 extra pins
   competing for attention on first load.
6. As a driver who has turned the camera layer on, I want each camera pin
   to show its location/road name, so that I know which camera to look for
   once I open BMA's viewer.
7. As a driver who clicks a camera pin's link, I want to understand (via
   the popup copy) that it opens BMA's general viewer rather than jumping
   straight to that camera, so that I'm not confused when I land on a
   generic page and have to search for the right feed myself.
8. As a driver, I want the camera layer to have zero effect on route
   verdicts, freshness filtering, or report merging, so that adding it
   can't accidentally change how existing flood reports are evaluated.
9. As a maintainer, I want camera pin locations to come from a checked-in
   snapshot rather than a live fetch on every page load, so that a slow or
   failing open-data API for essentially-static location data can't affect
   the reliability of the actually time-sensitive flood-report sources.
10. As a maintainer, I want a documented, repeatable way to refresh the
    camera snapshot when BMA adds or removes cameras, so that keeping it
    current doesn't depend on someone remembering the exact CKAN URL and
    CSV shape from scratch each time.
11. As a maintainer, I want the CSV-cleaning logic (filtering malformed
    coordinate rows) covered by an automated test, so that a future change
    to the cleaning logic can't silently start admitting bad rows (e.g.
    NaN/out-of-range lat/lng) into the published camera snapshot.
12. As a driver, I want a Citizen report with no photo (should be rare, but
    possible) to render its popup exactly as it does today, so that a
    missing photo never breaks or blanks the rest of the report's info.

## Implementation Decisions

- **Camera pin data**: a static JSON snapshot (e.g. one JSON array of
  `{ id, label, sublabel, lat, lng }` per usable row) checked into the repo,
  built from BMA's `bma-cctv` open-data CSV (`data.bangkok.go.th`, CKAN
  dataset). Per [ADR-0002](../../docs/adr/0002-camera-locations-vendored-not-live.md),
  this is intentionally *not* fetched live on page load like the three flood
  report sources — camera positions aren't time-sensitive the way flood
  reports are.

- **Regeneration script**: a dev-only Node script (not part of any
  build/deploy step) that fetches the CKAN CSV resource, parses and cleans it
  (dropping rows with missing/NaN/out-of-range lat or lng — research found
  ~234-238 usable rows out of ~238-239 raw rows), and writes the static JSON
  snapshot. Run manually, occasionally, by whoever notices the camera list is
  stale; its output is committed like any other file.

- **Camera pin rendering**: a new toggle control (following the existing
  tab-button pattern used for the freshness filter) shows/hides a Leaflet
  layer of camera pins, off by default. Camera pins are visually and
  conceptually distinct from report markers/dots (see CONTEXT.md "Camera
  pin") — they carry no Passability status, aren't affected by the freshness
  filter, aren't included in `mergeCorroboration`, and can't be added to a
  route. A pin's popup shows its location/road name and a link (opens in a
  new tab) to BMA's public traffic-camera viewer homepage — copy makes clear
  it's a general viewer, not a link to that specific camera, since no
  per-camera deep link exists in BMA's system.

- **Citizen report photo**: Traffy's `photo_url` field (already present in
  the data this app fetches for `loadTraffy()`) is carried through onto the
  Citizen report's point data. When present, the report's popup shows it as a
  small clickable thumbnail (opens the full-size image in a new tab). When a
  Citizen report is a contributor to a merged/corroborated point
  (`mergeCorroboration`), its photo still shows next to its entry in the
  existing per-contributor corroboration list, not only on points that are
  citizen-only.

- **No new trust framing needed**: the photo is presented under the same
  "unofficial, best-effort, not sensor-confirmed" framing Citizen reports
  already carry — no additional moderation disclaimer, since Traffy Fondue
  photos are subject to the same official-channel caveat as everything else
  from that source.

## Testing Decisions

- **What makes a good test here**: test the one piece of real logic — CSV
  row cleaning/filtering — against synthetic CSV text covering both valid and
  malformed rows. Don't test DOM rendering (camera pin markers, popups, the
  toggle control, the photo thumbnail) — consistent with this codebase's
  existing stance (see the Traffy Fondue Citizen report spec) of testing pure
  logic only, not Leaflet/DOM output.

- **New test seam**: `parseCameraCsv(csvText) -> cameras[]`, a pure function
  extracted into the dev-only camera-regeneration script, tested via Node's
  built-in `node:test` (same zero-dependency pattern as `data.test.js`).
  Cover: a well-formed row parses correctly; a row with missing/non-numeric
  lat or lng is dropped; a row with an out-of-Bangkok-range coordinate is
  dropped (reusing the same kind of bounding-box sanity check `data.js`
  already applies to other sources, though the exact bbox constant is a
  script-local decision, not necessarily `data.js`'s existing `BKK_BBOX`
  export, since this script runs standalone, not in the browser).

- **Prior art**: `data.test.js`'s existing tests (`capCitizenSeverity`,
  `mergeCorroboration`) are the direct precedent for this pattern — pure
  function, synthetic input, `node:test`/`node:assert`, no network/DOM.

## Out of Scope

- Longdo/iTIC's ~9 embeddable JPEG snapshot cameras, and DOH's
  `highwaytraffic.go.th` HLS camera streams (real, but needs a CORS-blocked
  precompute step and an `hls.js` player — a meaningfully bigger lift) —
  logged as possible future work, not part of this spec.
- YouTube livestreams — researched and explicitly rejected for now: no
  credible official, road-specific source currently exists. Worth
  revisiting later if BMA, DOH, or a Thai broadcaster launches one.
- Per-camera deep linking into BMA's viewer — confirmed not possible with
  BMA's current system; not attempted here.
- Traffy's `after_photo` field (a resolution/closure photo) — only appears
  once a ticket is marked resolved, and resolved Citizen reports are already
  excluded from the active set by existing closure logic, so there's nothing
  to show it for.
- Any change to Passability status, depth classification, route verdicts, or
  the freshness filter — both additions are purely additive/visual.
- Multi-photo galleries — Traffy's photo fields are single URLs, never an
  array, so there's nothing to build a gallery for.

## Further Notes

- See `CONTEXT.md` for the "Camera pin" term (distinct from report markers)
  and `docs/adr/0002-camera-locations-vendored-not-live.md` for why camera
  locations are a static snapshot rather than a live fetch, matching how
  `docs/adr/0001-traffy-fondue-undocumented-endpoint.md` documents the
  Citizen report source's own undocumented-endpoint trade-off.
- BMA's `Code DVR` / `ID Camera` CSV fields (structured IDs like
  `TF-HW-01-01-01`) are available from the source data even though they
  don't enable deep linking today — worth keeping in the vendored JSON in
  case a future BMA viewer update makes them useful.
