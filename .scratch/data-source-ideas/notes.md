Status: investigated 2026-09-27 via `/grill-with-docs` — no new current-state
report source qualified (see per-item verdicts below). One candidate
(ThaiWater TWA) is technically ready but shelved on a UI-scope decision, not
a viability one; revisit if a "leading indicators / related conditions"
link-out panel is ever picked up as its own idea.

# Candidate data sources to explore later

Found via a shared Thai-language roundup of flood-monitoring tools (2026-09).
Captured here as raw leads for future `/grill-with-docs` sessions — none of
these have been evaluated for API availability, CORS, rate limits, or data
quality the way `docs/adr/0001` (Traffy) and `docs/adr/0002` (cameras) did
for the current sources. Treat every URL below as "worth investigating," not
"known to work."

## Government / official

- **ThaiWater One Map** — https://www.thaiwater.net/new4all — dam levels,
  discharge rates, water levels at key stations. Multi-layer map:
  https://twa.thaiwater.net/th/map/basic. Could help predict when upstream
  water reaches a downstream area — different scope from this app's
  road-level passability focus, but maybe worth a link-out.
  **VERDICT (2026-09-27): technically viable, shelved on scope.** Real
  endpoint found: `https://twa-api-public.thaiwater.net/v2/*` (e.g.
  `/v2/waterlevel/list`, `/v2/large-dam/daily/list`,
  `/v2/waterlevel-discharge/list`, `/v2/waterlevel/canal/list`), CORS-open
  (`access-control-allow-origin: *`), and usable without a real secret — the
  official JS bundle ships a public fallback `x-api-key` for anonymous
  users, same undocumented-endpoint category as Traffy (ADR-0001). Not
  shipped because it's leading-indicator/upstream data, not current road
  state — no link-out UI section exists yet to put it in (a separate,
  deliberately-skipped-for-now product decision, not a rejection of the
  source itself).
- **DOH (Department of Highways) CCTV + flood coordinates** —
  https://hdms.doh.go.th/dashboard — highway-scoped, may overlap with or
  complement the existing BMA sensor source (`data.js` `loadBMA`).
  **VERDICT (2026-09-27): not-viable as found.** The dashboard is gated
  behind Keycloak SSO (`loginicc.doh.go.th`); the JS bundle references
  `hdms-api.doh.go.th/iccapi/detour-route/` and `/road-profile/` but they
  sit behind that login flow. Not confirmed whether any endpoint is public
  without auth — would need a live authenticated browser session to fully
  rule out, but the auth-gated UI is a strong signal it isn't.
- **TMD (Thai Meteorological Dept) rain radar** —
  https://weather.tmd.go.th (also a "Thai Weather" app) — upstream signal
  (rain, not flood state), could be a leading indicator rather than a
  Passability source.
  **VERDICT (2026-09-27): not-viable as a data source.** Only serves radar
  as periodically-refreshed static JPGs, no JSON/vector API found. A
  documented JSON API exists at `data.tmd.go.th/api/index1.php` but requires
  a registered API key — not safely embeddable in static client JS. Moot
  anyway: leading-indicator bucket, link-out UI deliberately skipped for now
  (see ThaiWater verdict above).
- **BMA rainfall gauges** — https://weather.bangkok.go.th/rain
  **VERDICT (2026-09-27): not-viable — CORS-closed.** Real AJAX endpoint
  found (`POST /rain/PageMap/GetDataForUpdate`, genuine JSON: station id,
  name, lat/lon, timestamp, rain readings), but it returns no
  `Access-Control-Allow-Origin` header under a cross-origin `Origin` header
  — a browser fetch from a static site would be blocked even though curl
  succeeds. Would need a proxy, which this project deliberately doesn't
  have. Moot anyway: leading-indicator bucket, link-out UI skipped for now.
- **BMA road-flood monitoring** — https://weather.bangkok.go.th/flood/ —
  worth checking whether this is the same underlying data as the existing
  `BMA_API` (`floodbangkok.bangkok.go.th`) source or a distinct one.
  **VERDICT (2026-09-27): not a duplicate, but not-viable — WAF blocks
  cross-origin.** Real endpoint `GET /Flood/PageMap/GetData?id=<district>`
  returns a richer, more road-specific schema (`flood_id`, `flood_code`,
  `flood_name`, `flood` level, `road_name`, coordinates) than `BMA_API`
  exposes — a genuinely distinct dataset, not just the same data restated.
  But it sits behind a WAF: a browser-like User-Agent/Referer gets 200, but
  adding a cross-origin `Origin` header flips it back to 403 — it actively
  blocks the exact request shape a static client site would send. Not
  usable without a proxy.
- **BMA canal flow rates** — https://weather.bangkok.go.th/KlongMap —
  flagged in the source roundup as useful but frequently down ("ล่มบ่อยนิด
  นึงครับ กดรีเฟรชหลายครั้งจะได้"), i.e. flaky — same category of risk
  `docs/adr/0001` accepted for Traffy's undocumented endpoint, but worth
  weighing before depending on it.
  **VERDICT (2026-09-27): not-viable — 403 across the board**, even with
  browser-like headers, consistent with the flaky reputation above. Moot
  anyway: leading-indicator bucket, link-out UI skipped for now.

## Third-party / private

- **Longdo Traffic** — https://traffic.longdo.com — likely the same
  underlying feed as this app's existing `LONGDO_EVENTS` source, or a
  related product from the same vendor. Worth checking for overlap.
  **VERDICT (2026-09-27): confirmed duplicate.** The site's JS bundle
  hardcodes `event.longdo.com` as its event/incident data source
  (`VUE_APP_LONGDO_TRAFFIC_EVENT_IMAGE_BASE_URL`, incident `imagenid`
  matching the `event.longdo.com/image/view/` pattern) — it's the official
  map UI over the same feed already used as `LONGDO_EVENTS`
  (`event.longdo.com/feed/json`). No separate data to gain. No action.
- **BMA Traffic CCTV viewer** — https://cpudapp.bangkok.go.th/bmatraffic —
  already linked from this app's Camera pin popups (`app.js`).
- **GISTDA flood app**, **Windy** (https://www.windy.com) — rain radar,
  similar role to TMD above.
  **VERDICT (2026-09-27): not-viable.** GISTDA's public API is key-gated
  (see new GISTDA Disaster Platform entry below). Windy's public API
  (`api.windy.com`) is a paid/keyed point-forecast product, not a free
  keyless JSON feed.
- **Google Flood Hub** — https://sites.research.google/floods — multi-day
  river-overflow forecasts by basin. Forecast, not current-state — different
  category from this app's "what's flooded right now" scope.
  **VERDICT (2026-09-27): not-viable.** Confirmed forecast-only (no
  "current state now" layer) and its documented Flood Forecasting API
  (REST + gRPC) is pilot-waitlist-gated, not open. Both wrong data shape and
  gated access.
- **peoplesparty.or.th flood aggregator** — https://flood69.peoplesparty.or.th/
  — a similar aggregation effort to this app itself; worth a look for
  prior-art / sources they use that we don't.
  **VERDICT (2026-09-27): no new sources surfaced except one** — see GISTDA
  Disaster Platform below. The site's own described source list otherwise
  matches everything already investigated here (ThaiWater One Map, Google
  Flood Hub, DOH CCTV, TMD radar, Windy, GISTDA, BMA systems).
- **GISTDA Disaster Platform** — `disaster.gistda.or.th/services/open-api`,
  docs at `opendata.gistda.or.th` — newly surfaced via the peoplesparty
  lookup above, not from the original roundup. Advertises open flood-extent
  /recurring-flood-area JSON data, which (unlike TMD/ThaiWater) could be
  *current-state* road-relevant data, not just an upstream leading
  indicator. **UNRESOLVED (2026-09-27): needs registration to verify.**
  Access requires an API key via `api-gateway.gistda.or.th`; unknown whether
  that key is a real secret or a public client key safe to embed (like
  ThaiWater's), and unknown rate limits. Worth one registration + test
  before writing it off, unlike the other key-gated candidates above.

## Emergency hotlines (not data sources, but noted for reference)

1784 ปภ. (rescue/evacuation, also LINE `@1784DDPM`) · 1669 (medical
emergency) · 1586 DOH / 1146 rural highways (route info) · 1129 PEA
(provincial electric) / 1130 MEA (Bangkok/Nonthaburi/Samut Prakan electric)

## Next step, whenever this gets picked up

The 2026-09-27 `/grill-with-docs` session above closed out every item in this
list: no new current-state (Sensor/Event/Citizen-shaped) report source
qualified. Two threads remain genuinely open for a future session:

1. **"Related conditions" link-out panel** — a distinct UI/product idea, not
   a data-sourcing one. If picked up, ThaiWater TWA is ready to wire in
   immediately (see its verdict above); TMD/BMA-canal images could join as
   raster overlays only, not JSON.
2. **GISTDA Disaster Platform** — the one unresolved lead (see above);
   needs an API-key registration + test before it can be verdicted.

If a *new* candidate not on this list ever comes up, still don't add it
directly — run it through `/grill-with-docs` first (per `AGENTS.md`) the way
Traffy was: confirm the endpoint actually exists and is fetchable
client-side (CORS, no auth), decide its Passability-status trust level (see
`CONTEXT.md`'s "Citizen report" for how Traffy was capped), and record the
decision as an ADR if it's a real trade-off.
