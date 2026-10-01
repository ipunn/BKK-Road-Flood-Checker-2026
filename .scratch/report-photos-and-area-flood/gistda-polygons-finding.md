# Finding: GISTDA LifeDee flood-warn / flood-forecast polygons (ticket 10)

Probed 2026-10-01 ~14:50 Bangkok. Primary sources only: the shipped client
bundle `https://lifedee.gistda.or.th/assets/FloodPage-CnY6J_Wk.js` (and the
i18n dictionaries in `assets/index-Dula8OAI.js`), plus live requests to the tile
host and the site's own API. No application code changed.

## What the layers are

The map page has two periods (`M = {DAY_1: "24h", DAY_3: "3d"}`):

| Period | Tile URL (host `check-water-map-service-726396821992.asia-southeast3.run.app`) | MVT layer name | Client colours |
|---|---|---|---|
| 24 h warning | `/tiles/flood-warn/{z}/{x}/{y}.pbf` | `flood_warn` | class 1 amber (`#f9a825`), class 2 red (`#b71c1c`) |
| Forecast, day N | `/tiles/flood-forecast-d{N}/{z}/{x}/{y}.pbf` | `nextday01` (seen for d1) | class 2 yellow, class 3 red |

Client text (EN / TH, from the site's own dictionary):
legend "24 hr warning" / "เตือนภัย 24 ชม."; "Forecast" / "คาดการณ์ล่วงหน้า";
class labels "Watch" / "เฝ้าระวัง" and "Flood warning" / "เตือนน้ำท่วม".
Popup risk names: normal / watch / warning (`ปกติ` / `เฝ้าระวัง` / `เตือนน้ำท่วม`).

## Polygon properties

Each tile feature is a **grid cell** (properties seen in the tile:
`left`, `right`, `bottom`, `row_index`, `col_index`, `class_risk`). The client
reads only `class_risk` (`Vs(..., t = "class_risk")`) and draws every ring with
the style for that value. Mapping from client code (`wt`, `Nt`):

- 24 h warning: `class_risk` 1 = Watch, 2 = Warning.
- Forecast: `class_risk` 2 = Watch, 3 = Warning (1 is not drawn).

Cells with `class_risk` null are skipped. Units: none (ordinal class).

## Validity time

Not in the tiles. Tile responses carry no `Last-Modified`, only `ETag` and
`Cache-Control: public, max-age=60`. The times live in the site's own API:

- `GET https://lifedee.gistda.or.th/api/flood-risk/summary-24h` ->
  `data.data.date_time` (observed `2026-10-01T07:10:00Z`, i.e. a few minutes old
  when read) = generation time of the 24 h warning.
- `GET .../api/flood-risk/forecast?dayOffset=N` -> `data.data.date_time`
  (observed `2026-09-30T19:00:27Z` = 02:00 Bangkok, a daily run) and
  `days[].forecast_date` (observed d1 = 2026-10-02, d2 = 10-03, d3 = 10-04 on
  2026-10-01, so `forecast_date` = today (Bangkok) + offset).

**Blocker:** that API returns `Access-Control-Allow-Credentials: true` but **no
`Access-Control-Allow-Origin`** (tested with an `Origin` header), so a static
site cannot read these timestamps from the browser. The tile host *does* echo
the origin (CORS-open). Therefore a stale tile cannot be recognised from the data
the app can reach.

## Update cadence

One sample each: warning `date_time` 07:10Z (looks sub-hourly, unconfirmed);
forecast one run per day at ~02:00 Bangkok. Not verified over time.

## Proposed label wording (no timestamp claimed)

Because the app cannot read generation time, label by what is known and say so:

- 24 h warning — EN: "GISTDA 24-hour flood warning (area-level; update time unknown)".
  TH: "เตือนภัยน้ำท่วม 24 ชม. จาก GISTDA (ระดับพื้นที่ ไม่ทราบเวลาอัปเดต)".
- Forecast day N — EN: "GISTDA flood forecast for {date} (area-level; model run time unknown)".
  TH: "คาดการณ์น้ำท่วมวันที่ {date} จาก GISTDA (ระดับพื้นที่ ไม่ทราบเวลาประมวลผล)".
  `{date}` = today (Asia/Bangkok) + N, matching `forecast_date`.
- Classes: "Watch / เฝ้าระวัง" and "Flood warning / เตือนน้ำท่วม". Plus the usual Related
  condition note: contextual, not a road report.

## Unknowns and risks

- Grid cell resolution and what "watch/warning" is derived from (rain model,
  terrain, history) are not stated anywhere in the client code; do not describe it.
- `flood-forecast-d2`/`d3` returned 404 for the one Bangkok tile I tried
  (z6/49/29) while d1 and warn returned data; 404 probably means "no polygons in
  this tile", but that is not confirmed. An empty tile and a missing layer look
  identical, so "unavailable" and "no warning here" cannot be told apart.
- Tiles exist only to about z6 (earlier note: 404 at z7+); the client over-zooms.
- Undocumented Cloud Run host, same class as ADR-0001/0004; renaming or removal
  would silently break the layer. Fallback: drop the layer.
- Layer cannot be rendered with Leaflet alone: needs a vector-tile renderer
  (e.g. Leaflet.VectorGrid or MapLibre from a CDN), or a small custom decoder.

## Consequence for ticket 11

Ship only with the "update time unknown" labels above, or do not ship. Needs a
decision from the user: the no-ACAO API means the honest "valid until" label in
the spec is not achievable client-side.
