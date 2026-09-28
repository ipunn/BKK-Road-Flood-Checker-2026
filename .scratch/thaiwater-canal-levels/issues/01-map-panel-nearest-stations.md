# 01: Fetch, parse, and show nearest canal water-level stations on the map page

**What to build:** A driver opens the map page and sees a persistent sidebar
panel listing the canal water-level stations nearest the current map view
(or the searched road, if a search is active), each showing its current
level and how recent the reading is, under an explicit disclaimer that this
is context, not a road-status report. The panel is always visible — it does
not appear or disappear based on whether BMA's feed is up or down — and if
ThaiWater's feed itself fails to load, the rest of the map keeps working
exactly as it does today when BMA/Longdo/Traffy fail.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `loadThaiWaterCanal()` added to `window.FloodData` in `data.js`,
      alongside `loadBMA()`/`loadLongdo()`/`loadTraffy()`, same `async`
      shape and same "throws on failure, caller degrades independently via
      `Promise.allSettled`" contract.
- [x] Fetches ThaiWater's public canal water-level endpoint. **Endpoint
      corrected from the ticket's original guess during implementation**:
      the paginated `/v2/waterlevel/canal/list` (10 rows/page, unconfirmed
      page-size override) turned out unsuitable for a "give me everything,
      I'll sort by distance" use case. `/v2/waterlevel/canal` (no `/list`) —
      ThaiWater's own `CANAL_MAP` route — returns the full, unpaginated set
      (253 Bangkok-scoped stations after filtering) as GeoJSON grouped by
      basin id, which is what's actually implemented. Uses ThaiWater's
      public fallback `x-api-key` (confirmed live: `TPSXrHRvTHeVT2Lygq6YeTqqAm4xZ72x`,
      the exact string ThaiWater's own JS bundle falls back to when no user
      is signed in) as a request header.
- [x] The exact response schema was confirmed against a live request first
      (see `data.js`'s `parseCanalStations` — GeoJSON `Feature` per station,
      `properties.measureValue`/`measureAt`/`station.{id,station}`,
      `geometry.coordinates` in `[lng, lat]` order) before writing the
      parser against it.
- [x] A pure parsing/cleaning function (`parseCanalStations`) is extracted
      from `loadThaiWaterCanal()` (mirroring `parseCameraCsv`'s role for the
      camera CSV) that drops rows with missing/non-numeric lat, lng, or
      level, and rows with out-of-Bangkok-range coordinates (reusing the
      `inBangkok`/`BKK_BBOX` pattern already in `data.js`).
- [x] Stations use a new shape, `{ key, label, lat, lng, levelM, updated }`
      — deliberately with no `status`, `depthCm`, or report-shaped `source`
      field, so a station cannot be passed into `mergeCorroboration`, ranked
      by `STATUS_RANK`, or included in `renderRoute()`'s verdict calculation.
      `loadThaiWaterCanal()` returns `{ stations, stationCount }`.
- [x] `distanceMeters` (previously private to `mergeCorroboration` in
      `data.js`) is exported for reuse.
- [x] A new pure function, `nearestStations(stations, lat, lng, limit)`,
      sorts by distance using `distanceMeters` and returns the closest
      `limit` stations.
- [x] A new always-visible `.panel` added to `index.html`'s sidebar,
      rendered by `app.js`'s `renderRelatedConditions()`, listing station
      name + water level + reading age. Rendered as a list
      (`.station-item` rows), never as map pins/markers — stays visually
      and structurally distinct from report markers/Passability dots.
      Re-sorted (not re-fetched) on map `moveend` and on road search input,
      per the spec's "nearest to current view or searched road" decision.
- [x] The panel's header/subtitle (`.related-conditions-note`) carries an
      explicit, unmissable disclaimer that this is contextual water-level
      data, not a road-status report.
- [x] `refreshAll()` in `app.js` adds `FD.loadThaiWaterCanal()` to its
      existing `Promise.allSettled` call; a ThaiWater failure degrades
      independently (panel shows an empty/error state via
      `renderRelatedConditions()`) and is added to the existing
      failure-note list shown via `setStatusLine`.
- [x] No change to `mergeCorroboration`, `STATUS_RANK`, `classify`, or
      `renderRoute()`.
- [x] `nearestStations` is covered by `node:test`: a station list longer
      than `limit` returns exactly the closest `limit` in distance order; a
      list shorter than `limit` returns all of them; equal-distance ties
      don't throw.
- [x] The extracted parsing/cleaning function is covered by `node:test`: a
      well-formed feature parses correctly; a feature with a
      missing/non-numeric level is dropped; a feature with an
      out-of-Bangkok-range coordinate is dropped; a mixed response keeps
      only the valid feature.

## Comments

Verified end-to-end against the live ThaiWater endpoint (not just synthetic
test data): `loadThaiWaterCanal()` returned 253 stations; `nearestStations`
correctly ranked central-Bangkok canal stations closest to a Bangkok-center
reference point. Full `node --test` suite (18 tests) passes. UI rendering
itself (the sidebar panel, disclaimer, station rows) was implemented per
the ticket's acceptance criteria but could not be visually verified in a
live browser this session — no Claude in Chrome extension connection was
available. Worth a manual look before considering this fully done.
