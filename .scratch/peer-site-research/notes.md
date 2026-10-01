Status: researched 2026-10-01 (during the active flood). Every endpoint below was
requested live with a cross-origin `Origin: https://x.github.io` header from a
shell and, for the peer sites, inspected in a real browser / their shipped JS.
"CORS-open" means the response carried `Access-Control-Allow-Origin` for that
origin (either `*` or an echo of it). Nothing here has been implemented; per
`AGENTS.md` and `.scratch/data-source-ideas/notes.md`, any candidate still goes
through `/grill-with-docs` and, where it is a real trade-off, an ADR.

Scope note (updated by the user mid-task): the product is widening from "road
passability" to also cover **area flooding** (neighbourhoods, lanes, low-lying
zones, possibly beyond Bangkok). Section 5 covers that; the rest was written
road-first and is tagged where it also matters for areas.

Prior art not repeated: `.scratch/data-source-ideas/notes.md` already
verdicted ThaiWater TWA, DOH HDMS, TMD, BMA rain/flood/KlongMap (CORS-closed
or WAF-blocked), Longdo, GISTDA gateway (unresolved), Google Flood Hub. Where
this file touches those it says what changed.

---

## 0. Headline findings (read this first)

1. **Traffy photo window is safe, and can be made much safer with one query
   parameter.** The bare endpoint we call returns only the latest **300 tickets
   of all categories** (today: 2026-10-01 00:49 -> 14:02 Bangkok time, about
   13 h, 69 flood tickets of which ~61 have a real photo). That 300-row cap, not
   report volume, is what would shrink a 12 h gallery on a busy day.
   `?problem_type=น้ำท่วม` returns **300 flood-only tickets reaching back ~25 h**
   (2026-09-30 13:30 -> now) for about the same payload (1.5 MB vs 1.3 MB).
   `?limit=1000` also works (cap is 1000; 4.7 MB, ~24 h, 330 flood tickets) but
   is heavy for mobile. Both are undocumented parameters on an already-undocumented
   endpoint (ADR-0001), so treat as best-effort and keep the plain call as
   fallback. See 6.1.
2. **The BMA flood centre publishes a human-curated "flooded roads" list as a
   public Google Sheet that is CORS-open.** 24 rows today with road, segment,
   a depth or a plain-language verdict ("งดสัญจรผ่าน", "รถเล็กหลีกเลี่ยง"),
   and approximate lat/lng. This is the closest thing found to an official
   passability statement. Big caveat: no per-row timestamp (see 6.2).
3. **`flood.bangkok.go.th/api/*` is a second official BMA/DDS API for the same
   `FL.*` road sensors**, CORS-open, 5-minute cadence, with `estimate_dry_time`
   and `peek_lv` that `floodbangkok.bangkok.go.th` (our `BMA_API`) does not
   expose. But it is **flaky**: roughly half of requests return the SPA's HTML
   shell instead of JSON. Useful as a redundancy/enrichment candidate, not a
   replacement. See 6.3.
4. **Reachable, official, keyless, CORS-open rain signals exist** (HII BMA
   radar at 5 min with a 2 h forecast; GISTDA LifeDee 30-min rain tiles; fews2
   flash-flood index). These are Related conditions (CONTEXT.md), not
   Passability inputs. See 6.4 to 6.7.
5. **Several things the peers use are CORS-closed and therefore out of scope**:
   BMA `now.bangkok.go.th/*.json` (incl. the 2 h district nowcast and shelter
   list), Rangsit City flood reports (JSON; images are hot-linkable), HII
   flash-flood warning JSON (origin allow-list), DWR EWS. See 6.8.
6. Two peer sites hide a **backend relay** (thflood.jaiful.life on Cloud Run,
   flood69.peoplesparty.or.th, flashflood-risk-intelligence on Vercel, meanam.com
   on Vercel) which is exactly how they get CORS-closed sources. We cannot copy
   that; we can only copy what is directly browser-reachable.

---

## 1. Peer site: meanam.com ("สายน้ำประเทศไทย")

Next.js (Vercel + Cloudflare). Verified via browser resource list, shipped JS
chunks, and curl.

**Feature inventory**
- National river/canal/dam atlas: ~120 rivers, ~80 dams, ~140 canals drawn from
  vendored static data (`/data/atlas.json`, `network.bin.gz`, `terrain*.bin.gz`,
  `roads.bin.gz`; canal geometry credited to OpenStreetMap).
- "Follow the water to the sea" interaction: click a station/dam/point and the
  river path to sea highlights, with catchment size, Strahler order, distance to
  sea, provinces passed.
- Live layer: ~806 telemetry stations coloured by **% of channel capacity**
  (level vs bank), with 2-day level chart, rising/falling/steady vs previous
  reading, gap below/above bank, measurement time, owning agency.
- Dams: storage % of normal capacity, inflow, release, per-dam page.
- Rain layer: 24 h accumulation or last-hour intensity from rain stations, with
  rain-over-catchment ("rain above this dam/point").
- TH/EN toggle, search by river/dam/canal/province, LINE OA, share buttons.

**Upstream data (primary)**: its own `GET /api/water` and `/api/rain` (CORS `*`,
Vercel-cached, `fetchedAt` stamped, refreshed on a 5-min bucket) are a thin relay
of **ThaiWater/HII** (`source` field literally says "คลังข้อมูลน้ำแห่งชาติ
(ThaiWater) สสน."). So there is nothing new upstream beyond what ADR-0004
already uses; Bangkok-relevant rows are the HII `BKKxxx` canal stations and RID
`C.12` (Sam Sen).

**Worth borrowing**
- **"Percent of bank + trend arrow + previous reading"** presentation for our
  canal stations. We already compute `waterLevelStatus` from BMA thresholds
  (ADR-0005); meanam's "x% of channel, rising 0.16 m since last reading" is a
  quicker glance than a colour alone and uses data we already fetch (the API
  returns `previous`, `bank`, `percent`). Maps to PRODUCT principle 2.
- Every popup says "data from X, updated every N min / at HH:MM". Same spirit as
  our principle 1; they treat the timestamp as first-class.
- Honest-limits copy: canal paths carry a note that flow direction depends on
  gate/pump operation. A model for our own "this is not a verdict" wording on
  Related conditions.

**Not worth borrowing**: the national river-network/terrain atlas (heavy vendored
binaries, out of scope for a one-glance road tool); dams (Related condition for
upstream awareness only, and already shelved per data-source-ideas).

---

## 2. Peer site: flashflood-risk-intelligence.vercel.app/bmr ("รอระบาย")

Next.js on Vercel with its own API (`/api/bmr/klongmap`, `/api/bmr/cameras`,
`/api/hii/waterlevel`, `/api/hii/rain`, `/api/hii/history?code=`). Verified in
browser (screenshot) and curl.

**Feature inventory**
- Canal-network **schematic** ("ผังคลอง กทม."): canals as straight lines, gauges
  as dots, gates/pump stations as diamonds, river-gate pairs flagged when
  outside-minus-inside head >= 1 m. Not a geographic map; a "real map" toggle
  exists.
- Header stats: points over critical (36), overbank stations (4), cameras with
  live image (13/63), last update clock.
- Leaderboards: "most over critical" (e.g. +0.69 m) and "most overbank %".
- 200 gauges (141 gauge + 59 gate/pump) with BMA `warning`, `critical`, `bank`,
  `maxToday`, `ageMin` (age is computed and shown per station: good).
- Camera tiles: **63 cameras listed, only those that actually return an image are
  shown as live** (13 today). Snapshot tile text distinguishes live MJPEG vs a
  still vs a saved "image taken at HH:MM". Sources: iTIC Motion (57) and BMA DDS
  (6).
- Scope extends to the metro belt (Nonthaburi, Pathum Thani, Samut Prakan,
  Samut Sakhon, Nakhon Pathom) on its `/bmr` route.
- Tide card (high/low times) and links to TMD radar loops.

**Upstream data (primary)**: its own `attribution` field says the klongmap
payload is BMA DDS KlongMap "via relay flood69.peoplesparty.or.th". So the
gauge thresholds are BMA's KlongMap dataset, reached through two relays because
`weather.bangkok.go.th` is CORS-closed (confirmed in data-source-ideas). Cameras
are iTIC `camera1.iticfoundation.org` JPEG/MJPEG endpoints. HII rain/waterlevel
are ThaiWater data again.

**Worth borrowing**
- **Per-camera "does it currently return an image" test** before showing it, plus
  explicit still/live/saved labelling. Principle 1 applied to images. Directly
  relevant to the photo feature (section 4).
- iTIC camera JPEG/MJPEG hot-link: `https://camera1.iticfoundation.org/jpeg2.php?camid=...`
  returned `200 image/jpeg` (51 KB) with no auth and no `Access-Control-Allow-Origin`.
  An `<img>` does not need CORS, so a browser-side thumbnail is feasible, but
  whether iTIC permits hot-linking, and the camera list's provenance, were **not**
  verified (list comes from their backend). Do not ship without that check.
- Gate/pump-station differential ("outside minus inside head") is a genuinely
  flood-relevant derived signal; the data (`outsideLevelM`, `levelM`) is already in
  BMA/ThaiWater canal feeds. Only worth it if canal stations stay in scope.
- "Over critical by +0.69 m" ranking is a one-glance format for the canal panel.

**Not worth borrowing**: the schematic-map metaphor itself (contradicts "answer
can a car pass this road"; our map is geographic for good reason).

---

## 3. Peer site: thflood.jaiful.life ("น้ำท่วมตอนนี้")

A single static HTML page (183 KB, inline JS, Leaflet) plus a Cloud Run backend
(`/api/flood`, `/api/traffy`, `/api/rangsit`, `/api/now`, `/api/doh`). Most
complete of the four and the closest in intent to us. Read its full source.

**Feature inventory**
- Hotline strip (1669, 1784, 1555, other) and LINE link at the top, always visible.
- **"แถวบ้านคุณเป็นยังไง?" (how is my area?)**: one-shot geolocation, never stored,
  produces a short answer list: nearest road sensor (and refuses to say "dry" if
  the nearest sensor is >0.7 km away or stale), nearest canal with trend / margin /
  ETA to bank, Rangsit-confirmed reports within 1 km, **count of Traffy reports within
  1 km in the last 6 h** (labelled "not yet confirmed"), nearest camera link, nearest
  open shelter. Optional "my floor height vs road water depth" self-entered
  comparison stored only on the device.
- Counts by depth band (4 / 3 / 6 / 0 today) and a list of road sensors >= 20 cm.
- Layers: road sensors, canals, Traffy reports (+ district heat chips
  "districts with most reports"), Rangsit city-verified reports with photo,
  national highways closed/flooded (DOH), shelters, CCTV, rain radar (RainViewer,
  ~2 h history), next-6-hour rain (Open-Meteo), BMA 2 h nowcast, tide table.
- Region selector beyond Bangkok ("กทม. และปริมณฑล" + others) and a **large-text
  mode** button for accessibility.
- Honest "stale" handling: sensors with an old reading are drawn grey with an
  inset ring showing the last wet level ("ค่าเก่า"); a sensor that cannot resolve
  below 20 cm is flagged as a step ("≥20").
- Data-source link list and "call to confirm before travelling" on shelter data.

**Upstream data actually reachable from a browser** (this is what is worth our
time; the rest is behind their server)
- `docs.google.com` Google Sheet (BMA flood centre CCTV flood list): CORS-open.
  See 6.2.
- RainViewer, Open-Meteo, HII urban radar: CORS-open. See 6.4 and 6.7.
- Traffy `photo` images from `storage.googleapis.com/traffy_public_bucket/...`.
- Rangsit City images `cdp.rangsitcity.go.th/api/flood/image/{id}`: hot-linkable
  with `<img>` (200 `image/jpeg`), but the list JSON is CORS-closed (section 6.8).

**Worth borrowing** (ranked by value/effort for us)
1. **The "refuse to say clear when the nearest sensor is far or old" rule.** Our
   verdict model already distinguishes unknown from clear; their explicit copy
   ("ไม่มีเซนเซอร์วัดน้ำบนถนนแถวนี้ ... ห้ามพูดว่าแห้ง") is the same stance, worded
   for a layperson. Cheap copy win; matches principles 1 and 3.
2. **Always-on emergency strip** (1784 / 1669 / 1555). Static, no data, high value
   at the worst moment. Already noted as reference-only in data-source-ideas, never
   surfaced in the product.
3. **Geolocate-once "around me" summary** that answers the neighbourhood question,
   never stores position. Strong fit for the new area-flood scope (section 5).
4. **Traffy report count + district chips within N km, labelled "not yet confirmed"**
   as a separate line from verdicts. Matches our rule that Citizen reports never
   drive `blocked`.
5. **Large-text toggle** for outdoor/glare use (PRODUCT: accessibility).
6. **Photo with an explicit age warning** past 24 h ("อาจไม่ใช่สถานการณ์ปัจจุบัน"):
   same idea as our Report photo age label (CONTEXT.md).

**Cautions found in their approach** (what not to copy)
- Rangsit reports carry a categorical self-reported scale (ANKLE / KNEE / WAIST /
  IMPASSABLE); their UI presents it as a "level". ADR-0003 already rejects
  inferring depth from such wording. If we ever show it, only as text/photo, never
  as depth.
- They run a backend; several layers (DOH, Rangsit, BMA NOW) simply do not exist
  for us.

---

## 4. Site: github.com/gain9999/thaiwater (skill-file collection)

Not a site; 15 Markdown skill files (`skills/*.md`) telling an agent which URLs
to curl. Read from a fresh clone; **every claim below is from a request I made,
not from the repo text**, because several entries are stale or wrong.

| Skill claim | What I found (2026-10-01) |
|---|---|
| `flood.bangkok.go.th/api/*` "public" | True. JSON, `ACAO: *`, but ~50% of calls return the SPA HTML (see 6.3). |
| `api-v3.thaiwater.net/.../public/flood_road` | 200, CORS echo, 262 rows, but it is the BMA `FL.*` sensors relayed with a **2026-09-28 timestamp** (240 of 262 rows). Stale duplicate of our BMA source. Skip. |
| HII `warning/flashflood-24h` | 200 JSON from curl, but **CORS allow-list is `www.thaiwater.net` only**. Not callable from our origin. |
| `ews.dwr.go.th` station POST | 200 JSON, 3 MB, **no CORS header**. Out of scope. Also mountain flash-flood stations, not Bangkok roads. |
| DDPM `api.disaster.go.th` | Skill itself says Cloudflare challenge, browser only. Not probed further. |
| GISTDA WMS with embedded key | `GetCapabilities` returns 200 with `ACAO: *` but only a single "Vallaris Blank" layer; the flood layers the skill describes were not present. Not usable as described. |
| `fews2.hii.or.th/.../flashflood_report.txt` | **Works, CORS `*`.** See 6.6. |
| `hydro-hims.hii.or.th/service/api/urban/data?token=` | **Works, CORS `*`.** BMA radar. See 6.4. |
| `fews2 .../tide_table/summary.txt` | Works, CORS `*` (Gulf tide table, Navy HQ + Bangkok Bar etc.). Not a flood signal on its own. |
| `hdms-api.doh.go.th/iccapi/detour-route/` | See 6.8: declared as bearer-auth but unenforced; data is 2025 cases. **Do not use.** |

Ethical/robustness note: the skills embed tokens harvested from other sites'
JS bundles (HII `4UQaYn...`, `oeLrEj...`, ThaiWater `TPSXrH...`). The ThaiWater one
is already our accepted trade-off (ADR-0004); adding more such tokens increases
the "silent breakage on rotation" surface that ADR-0004 already warns about.

---

## 5. Area-level flooding: how peers show it, what data exists, where it conflicts with Passability

### 5.1 How each peer presents area/zone flooding
- **meanam**: not about flooding; it is channel fullness per station (% of bank)
  and rainfall per catchment. Area = river basin. No "is my street flooded".
- **flashflood/รอระบาย**: area = canal reach. A canal gauge over critical implies
  the surrounding low land may flood, but the site does not say that. It is a
  canal-operator view.
- **thflood**: the only one that tries the area question directly. It answers
  "around me, within ~1 km" with a short stack (road sensor, canal, confirmed local
  reports, count of Traffy reports, shelter) and shows **district chips** for where
  citizens are reporting most. It deliberately keeps citizen counts separate and
  labelled "unconfirmed" and refuses to claim "dry" without a nearby fresh sensor.
- **peoplesparty flood69** (seen via data-source-ideas, and its relay API): area
  info is shelters, car-parking points and canal levels; not zone flood extents.

### 5.2 Data that gives an area-level signal (verified)

| Source | Area semantics | Coverage | Browser-reachable? | Cadence / freshness |
|---|---|---|---|---|
| **Traffy flood tickets** (our existing endpoint) | Point reports; ~31% of flood tickets in the 24 h sample did **not** mention a road/soi word (227 of 330 did), i.e. neighbourhood or village flooding | Bangkok only (all 1000 sampled tickets were province กรุงเทพมหานคร) | Yes, CORS `*` | Cached ~30 min server-side per `source` string; ~14 flood tickets/h over 24 h |
| **GISTDA LifeDee flood tiles** (`check-water-map-service-...run.app/tiles/flood-warn`, `flood-forecast-d{0..3}`) | **Polygon** flood warning and 1-3 day forecast areas, vector tiles, max zoom 6 (client over-zooms) | Nationwide | Yes, `ACAO` echoes origin; needs a vector-tile renderer | `Cache-Control: max-age=60` |
| GISTDA LifeDee **flood-frequency WMS** (`lifedee.gistda.or.th/api/flood-risk/flood-freq/wms`, `LAYERS=0`) | Raster of historically recurring flood zones | Nationwide | `<img>`/Leaflet WMS works (200 `image/png`, 93 KB); no ACAO header but not needed for tiles | `no-store`; the underlying data is historical, not live |
| GISTDA LifeDee **rain-30min** tiles (`.../tiles/rain-30min/{z}/{x}/{y}.webp`) | Raster rainfall, 30-min accumulation | Nationwide | Yes, `ACAO` echoes origin, WebP raster for `L.tileLayer` | `max-age=60` |
| HII **BMA urban radar** (`hydro-hims.hii.or.th/service/api/urban/data?token=...`) | Observed rain rate raster + forecast frames | Bangkok metro (bounds 99.735-101.96 E, 12.75-14.91 N, Nong Chok radar) | Yes, JSON `ACAO: *`; image overlay via `L.imageOverlay` | 24 frames, 5-min steps, observed from ~13:25 to forecast up to +60 min, unit mm/hr |
| HII **fews2 FFPI report** (`.../flashflood/flashflood_report.txt`) | Tambon-level flash-flood index and 1-day forecast rain; lists only at-risk tambons (1 row at 06:43Z today) | Nationwide | Yes, CSV `ACAO: *` | File `Last-Modified` 2026-10-01 06:43 UTC; updates roughly hourly |
| `flood.bangkok.go.th/api/flood/currentevent` | Road segments, not areas, but includes `estimate_dry_time` | Bangkok | Yes (flaky) | ~5 min |
| BMA NOW `nowcast-data.json` (district 2 h rain nowcast) and `floodsupport-data.json` (428 shelter/parking/medical points) | **District-level** rain forecast + service points | Bangkok | **No, no CORS header** | 10-30 min |
| Rangsit `api/flood/reports` | Verified local reports with photo | Rangsit only (140 rows) | **No** (JSON), images yes | live |
| ThaiWater TWA flood/water layers | station-based, not area | Nationwide | Yes (ADR-0004) | hourly-ish |

### 5.3 Nationwide vs Bangkok-only
- **Bangkok-only**: Traffy (our feed), BMA sensors, BMA NOW, `flood.bangkok.go.th`,
  HII BMA radar.
- **Nationwide** and browser-reachable: GISTDA LifeDee tiles (flood-warn,
  forecast, flood-freq, rain-30min), fews2 FFPI, ThaiWater TWA stations (already
  used), RainViewer radar, Open-Meteo forecast.
- If area scope extends beyond Bangkok, the **only keyless, CORS-open
  area-polygon source found is GISTDA LifeDee**. It is undocumented (Cloud Run
  service + website API), so it carries the same ADR-0001/0004 class of risk and
  would need its own ADR.

### 5.4 Where area data conflicts with the Passability model
- **Passability is a per-road, per-moment claim about a car getting through;
  area signals are about "water exists around here".** A flood-warning polygon or
  FFPI says nothing about whether a specific road is passable. Colouring roads by
  intersecting polygons would be exactly the "confident-looking but unsupported"
  verdict PRODUCT principle 1 and ADR-0003 reject. Recommendation: area layers are
  **Related conditions** (CONTEXT.md): shown, never merged into `classify()`, never
  a `mergeCorroboration` contributor, visually distinct (like `--canal-status-*`).
- **Corroboration (~300 m proximity merging)** was designed for point reports about
  one flooded road spot. An area report ("whole village under water, 2 km^2")
  does not corroborate a sensor 300 m away in a meaningful way; merging would
  inflate confidence. Area-type reports need an explicit "no merge" rule.
- **Citizen cap at caution** still applies, and for area reports the natural cap
  is "unknown/informational" (no depth, no road).
- **Time semantics differ**: polygons are forecasts (hours to days) or historical
  frequency; they cannot share the 3 h/1 h freshness windows used for reports.
  They need their own labelled timestamps ("forecast issued ...", "historical
  frequency, not current").
- **Depth semantics differ**: area sources give categories (warning levels, FFPI)
  or categorical self-reports (KNEE etc.), which ADR-0003 forbids turning into cm.
- **Naming**: CONTEXT.md's "Passability status" and "Related condition" definitions
  already assume road scope; "Citizen report" assumes a road-ish point. Expect a
  CONTEXT.md/ADR update ("Area report", "Area condition") before building.

---

## 6. Verified data-source ranking

Ranked by value to the product (area + road scope, principle fit) then effort and
risk. "CORS" = browser-readable cross-origin. All checked 2026-10-01 07:2x-07:3x UTC.

### 6.1 Traffy Fondue, extra query parameters on the existing endpoint (HIGH)
- `https://publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2`
- Default response: 300 features, all categories, ~13 h today. `?limit=1000` -> 1000
  features (cap), ~24 h, 4.7 MB. `?problem_type=น้ำท่วม` -> 300 flood-only features
  reaching back ~25 h, 1.5 MB. `?problem_type=น้ำท่วม&limit=1000` returned a 3.9 KB
  non-feature body (error), so the two do not combine. `type=`, `hours=`, `state=`,
  `since=` were ignored (default 300 returned, or an unrelated server message).
- Auth: none. CORS: `*`. Server cache: `geojson cache ... expire 1800s` in the
  response `source` string, so any ticket can be up to ~30 min behind real time.
- Response header block also carries city-wide counters (`total`, `sum_state`),
  usable for a "reports are slowing/rising" indicator for free.
- Photos: `photo_url` on `storage.googleapis.com/traffy_public_bucket/attachment/YYYY-MM/<hash>.jpeg`.
  In the 300-ticket flood sample, 61 of 69 flood tickets had real photos, 8 used the
  shared placeholder (same as ADR/`data.js` `TRAFFY_PLACEHOLDER_PHOTO_URL`). Also
  `after_photo` exists on resolved tickets (a different, not-needed image).
- Risk: undocumented (ADR-0001). The parameter is another undocumented behaviour
  that could vanish; keep the plain call as fallback and surface a window-length
  caveat if only the fallback loads.

### 6.2 BMA flood centre "flooded roads" Google Sheet (HIGH value, MEDIUM risk)
- `https://docs.google.com/spreadsheets/d/1CcX-TrFAOe1TdrWHK1XPAiaXqgQfdT9wvU_TCeFPmDs/gviz/tq?tqx=out:csv&gid=1730237192`
- Found as the declared source of `now.bangkok.go.th/cctv-flood-data.json`
  (`source.title` "ข้อมูลจากศูนย์ป้องกันน้ำท่วมฯ"). CSV, 24 rows now:
  `ลำดับ, ถนน, ช่วง/จุดที่ท่วมสำคัญ, ระดับน้ำสูงสุด / สถานะ, ละติจูด (Y), ลองจิจูด (X)`.
  Values like "30 ซม. (งดสัญจรผ่าน)*", "รถเล็กหลีกเลี่ยง", "ท่วม 2 เลน".
- Auth: none. CORS: `ACAO` echoes the request origin. Updated by hand; BMA's own
  JSON shows `reportedAt` = last time their importer ran, which is not the time the
  row was written.
- Why high: official, human-judged, carries both the road segment and a
  plain-language passability judgement, including the explicit impassable and
  "avoid with small cars" phrasing that ADR-0003 says is acceptable evidence.
- Risks: (a) **no per-row timestamp**: showing any row as current violates
  principle 1 unless we label it "BMA flood centre list, update time unknown" or
  detect changes ourselves; (b) sheet ID/gid/columns can change without notice;
  (c) coordinates are "approximately"; (d) it is a Google Sheet BMA may restrict;
  (e) free-text status would need a conservative parser. Passability trust level
  would be a new decision (a human-curated official claim is stronger than a
  citizen report but weaker than a calibrated sensor).

### 6.3 `flood.bangkok.go.th/api/*` (MEDIUM; redundancy/enrichment)
- Docs: none official; endpoints documented only in gain9999/thaiwater (unverified
  there) and seen in `dds_bangkok.md`. Verified: `GET /api/flood/currentevent`,
  `/api/flood/stationstatus_dt?period=5&datetime=<ISO Z>`, `/api/mainwater/lastdata/0`,
  `/api/water/info/<code>`.
- Headers: `Access-Control-Allow-Origin: *` (duplicated), `Cache-Control: no-cache`.
- **Reliability problem**: about half of repeated identical requests returned HTTP 200
  with `text/html` (9,841-byte SPA shell) instead of JSON; a retry usually succeeds
  within 1-4 tries. A client would need a JSON-content-type check plus retry.
- Content: `currentevent` (14 rows now) adds `estimate_dry_time`, `peek_lv`,
  `start_time`, and `district`; `stationstatus_dt` (16 rows) gives per-5-min status
  with BMA colours (`normal/warning/critical`); `water/info/<code>` returns
  `wl_warning`, `wl_critical` for canal stations (cross-checks our
  `CANAL_STATION_THRESHOLDS`). `mainwater/lastdata` only lists 34 canal stations and
  some are weeks stale (one at 2026-09-06): do not use it for freshness-critical data.
- Overlap: `FL.*` codes are the same physical sensors as `floodbangkok.bangkok.go.th`;
  `WL.*` are the same canal stations as ThaiWater. Value is a **second path** if
  Directus (`BMA_API`) fails (PRODUCT.md notes sources fail independently), not new
  coverage.

### 6.4 HII BMA urban radar + 2 h forecast (MEDIUM; Related condition)
- `https://hydro-hims.hii.or.th/service/api/urban/data?token=oeLrEjIwGpHaT7pQ1p3kB2iZa6kRcYEXy0GGb75nLpPQxHqOU6`
  (token is the one shown in the thaiwater repo; **must be treated like ADR-0004's
  key**: public-bundle-derived, undocumented, rotatable).
- 200 JSON, `ACAO: *`. 24 frames, 5-minute spacing, past observed + up to +60 min
  forecast (`.../bmaradar/png/obs/...` and `.../for/f_..._60.png`), `metadata` gives
  bounds for an image overlay, `mm/hr` unit and a colour bar PNG.
- Bangkok-specific. Gives "is it raining hard on my route right now / next hour".

### 6.5 GISTDA LifeDee map services (MEDIUM-HIGH for area scope; MEDIUM-HIGH risk)
- Tiles: `https://check-water-map-service-726396821992.asia-southeast3.run.app/tiles/{flood-warn|flood-forecast-d{day}}/{z}/{x}/{y}.pbf` and `.../rain-30min/{z}/{x}/{y}.webp`;
  WMS: `https://lifedee.gistda.or.th/api/flood-risk/flood-freq/wms?&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=0&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:4326&BBOX=...&WIDTH=256&HEIGHT=256` (the stray leading `&` is what the site sends; sending `STYLES` is rejected with 400).
- Discovered by reading the shipped `FloodPage-*.js` of `lifedee.gistda.or.th/map/flood`.
  No API key in these calls (unlike the `api-gateway.gistda.or.th` route flagged
  unresolved in data-source-ideas, which I could not make return flood layers).
- Vector tiles exist only up to z6 (404 at z7+), nationwide, forecast days
  `d0` (empty), `d1`, `d3` returned data, `flood-warn` returned data. Feature
  properties were not decoded; **warning-polygon semantics are unverified**.
- Requires a vector-tile renderer (MapLibre GL or Leaflet.VectorGrid from a CDN);
  that is a new dependency and conflicts with "no build step" only mildly (CDN
  script), but it is a real UI change.
- Risk: the service is a Cloud Run hostname with a numeric project id, not a
  published API; could be renamed at any time. Treat exactly like ADR-0001/0004.
- This also answers the open item in data-source-ideas ("GISTDA ... unresolved,
  needs registration"): **the LifeDee tile services need no registration**, so
  the registration-then-test route is no longer the only path.

### 6.6 fews2.hii.or.th data portal (LOW-MEDIUM; Related condition)
- Flat files, CORS `*`, `Last-Modified` headers present, keyless, no token:
  `flashflood/flashflood_report.txt` (tambon FFPI + 1-day rain; only at-risk
  tambons listed), `tide_table/summary.txt`, `metadata/hii_waterlevel.csv` (station
  thresholds), `radar/latest/png/rain24hrs.png` (24 h accumulation PNG),
  `flashflood/storm.txt` (tropical storms).
- Because they are static files with `Last-Modified`, they are the cleanest items to
  display with an honest "updated HH:MM" label (principle 1).

### 6.7 Rain/forecast overlays used by thflood (LOW-MEDIUM; Related condition)
- RainViewer `https://api.rainviewer.com/public/weather-maps.json` (CORS `*`, 12
  past frames at 10-min) and Open-Meteo hourly precipitation (CORS `*`, keyless
  non-commercial). Both verified reachable. **Licence/usage terms not verified**;
  check before shipping (Open-Meteo's free tier is non-commercial; RainViewer's
  public API terms/attribution rules apply). Not official Thai agencies, so they
  fit our "official/primary" bias less well than HII/GISTDA.

### 6.8 Out of scope (needs backend/key, or not reachable)
| Source | Why out | Evidence |
|---|---|---|
| `now.bangkok.go.th/*.json` (road, CCTV, canal, nowcast, floodsupport, district-contacts) | No `Access-Control-Allow-Origin` on any of the six | headers captured; `nowcast-data.json` would otherwise be the best official 2 h district rain signal; shelter list (428) likewise |
| `cdp.rangsitcity.go.th/api/flood/reports` | JSON CORS-closed; only images hot-linkable (`<img>`) | JSON had no ACAO; OPTIONS 204 without ACAO |
| HII `api.hii.or.th/.../warning/flashflood-24h` | Origin allow-list = `www.thaiwater.net` | `Access-Control-Allow-Origin` echoed only for that origin |
| DWR EWS (`ews.dwr.go.th/ews/web-service/stn`) | No CORS on POST; mountain stations | 3 MB JSON, no ACAO |
| DOH detour-route API (`hdms-api.doh.go.th/iccapi/detour-route/detour-routes`) | OpenAPI says Bearer auth required for `/detour-routes`; server nonetheless answered without a token and with `ACAO: *`. Data = 243 cases dated 2025 (latest `202512160017`), no current flood closures. I will not recommend relying on an endpoint whose auth is declared but unenforced. | Contradicts the data-source-ideas "not viable as found" only in that there IS an open path, but it is stale and unintended |
| `thflood` DOH closures (`/api/doh`, 172 current rows) | The origin of this live DOH data was not found; it is behind their backend | no browser-reachable source found |
| `flood69.peoplesparty.or.th/api/*` | Third-party relay, no ACAO; other routes 401 | explicit "via relay" attribution on flashflood site |
| KlongMap (`weather.bangkok.go.th`) | already CORS/WAF-blocked | data-source-ideas |
| meanam `/api/water`, `/api/rain` | CORS `*` but a **third-party relay of ThaiWater**; depending on it adds a hobby-run hop vs calling TWA directly | `source` field |
| TMD radar GIF (`weather.tmd.go.th/pic_bmancLoop.gif`) | Reachable as `<img>` (3.9 MB animated GIF, no CORS) but not data, and heavy | HEAD only |
| Anything key-gated (TMD data API, GISTDA gateway, Windy, Flood Hub) | unchanged from data-source-ideas | |

---

## 7. Keeping the Traffy photo feature valuable (answer to question (a))

Context: "Report photo" is independent of verdict freshness, up to ~12 h, Longdo
event images included, never changes Passability status (CONTEXT.md).

1. **Make the window robust to volume, not just time.** Today the plain endpoint is
   effectively a 13 h window because of the 300-ticket cap. On a quieter or busier
   day that window moves. Use `?problem_type=น้ำท่วม` so the 300 slots are all flood
   tickets (~25 h reach today); then 12 h is safe in either direction. If the
   parameter fails, fall back to the plain call and tell the user the gallery may
   be shorter ("showing reports from the last ~N h" computed from the oldest
   returned ticket). Principle 1.
2. **Use the whole flood ticket, not only road-matched ones, for photos.** Photos on
   tickets that are inside Bangkok but not on a gauged/matched road are still
   evidence of neighbourhood flooding. In the sample, ~31% of flood tickets did not
   mention a road/soi word. (Interaction with passability: photo shows an area,
   never colours a road.)
3. **Show per-photo age as the primary label** (already decided) and add the
   thflood-style warning past ~24 h only if the window is ever extended.
4. **Group gallery by district/area chips** ("Prawet 18, Lat Krabang 10, ...") so
   the photo feature doubles as an area view and survives low report counts. The
   district field is already in the ticket (`district`, `subdistrict`). From the
   sample: 18 districts had flood tickets.
5. **Show ticket resolution state but do not hide resolved photos**, labelled
   ("ส่งต่อ(ใหม่)" / "เสร็จสิ้น"): of 69 flood tickets 38 were "in progress", 22
   "awaiting", 1 "completed". Careful: Traffy state can be reverted (existing note
   in `data.js`), so state is context, never truth.
6. **Add the other open image sources that need no CORS** (images only need `<img>`):
   Rangsit City report images if IDs ever become reachable (they are not, list JSON is
   closed), iTIC camera stills (needs hot-link permission check), Longdo event images
   (already included). Camera stills are the right low-volume complement: they do
   not depend on citizens filing. Follow flashflood's "only show a camera that is
   returning an image now, label live vs still" rule.
7. **Do not infer depth or severity from photos or wording** (ADR-0003). Same applies
   to peers' KNEE/ANKLE style categories.
8. **Avoid hot-link breakage honestly**: Traffy photos are on a public Google Cloud
   Storage bucket (no auth, loads in `<img>`), but if an image 404s it should vanish,
   not leave a broken box (principle 4).

---

## 8. Recommended improvements, ranked, with PRODUCT principle ties

| # | Improvement | Principle | Effort | Risk / decision needed |
|---|---|---|---|---|
| 1 | Query Traffy with `?problem_type=น้ำท่วม` (fallback: plain), compute and display the *actual* oldest-ticket age as the gallery's reach. | 1 never stale | S | New ADR addendum to ADR-0001 (second undocumented parameter) |
| 2 | Gallery-by-district view / area chips over Report photos, keep roads and photos separate. | 2 glance; new area scope | S-M | CONTEXT.md term for non-road reports |
| 3 | Always-visible emergency strip (1784, 1669, 1555) + large-text toggle. | 2, accessibility | S | none |
| 4 | "Around me" one-shot geolocation summary (nearest sensor, canal, report count within ~1 km, "no sensor here" rather than "clear"), position never stored. | 1, 2 | M | Define "area answer" wording; does not touch route verdicts |
| 5 | Canal panel: show % of bank, trend vs previous reading, and gate/pump head differential if present, using the same ThaiWater call. | 2, 1 | S | none (data already fetched) |
| 6 | Add the BMA flood-centre Google Sheet as a *new, separately-labelled* official-judgement source with "update time unknown" label; do not pass through `classify()` until a trust level is decided. | 1, 3 | M | New ADR: trust level, fragility of an undocumented sheet, missing timestamps |
| 7 | Add `flood.bangkok.go.th/api/flood/currentevent` as a retrying fallback/enrichment (`estimate_dry_time`). | 1 | S-M | Retry-on-HTML logic; ADR note for a second undocumented BMA path |
| 8 | Related-condition rain layer: HII BMA radar frames (observed + 60 min forecast) and/or GISTDA `rain-30min` tiles, with explicit "forecast" vs "observed" and issue time. | 1, 2 | M | Token/endpoint rotation risk (ADR-0004 class); the "Related conditions panel" product decision still open |
| 9 | Area scope pilot: GISTDA LifeDee `flood-warn`/forecast polygons as a labelled Related condition, no merging with road reports. | 3 (keeps passability pure) | L | New dependency (vector tiles), decode/verify polygon semantics first, ADR; CONTEXT.md area vocabulary |
| 10 | iTIC camera stills filtered to "currently returning an image". | 1 | M | Verify hot-link permission and camera list provenance first |

Suggested order: 1 -> 3 -> 5 -> 2 -> 4 (cheap, in-principle, no new source), then
6 and 7 (new official road signal and redundancy), then 8 and 9 once the "Related
conditions" and "area report" product decisions are made.

## 9. Things I could not verify (do not treat as established)
- Meaning of the GISTDA `flood-warn` and `flood-forecast` polygon properties (tiles
  fetched, not decoded).
- Whether iTIC permits hot-linking its camera JPEGs, and where flashflood's
  camera list comes from.
- How BMA edits the flooded-roads Google Sheet (cadence, who, whether rows are
  cleared) and whether Google/BMA may later restrict it.
- Terms of use for RainViewer and Open-Meteo.
- How thflood obtains live DOH closures (172 rows); no browser-reachable primary
  source located.
- Meanam's rain data origin beyond "ThaiWater/HII" (the relay's field says so; the
  underlying call was not inspected).
- Whether Traffy's undocumented `problem_type` parameter is stable across the cache
  window; only a handful of calls were made.
