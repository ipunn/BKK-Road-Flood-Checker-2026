Status: exploratory — not yet triaged into a spec/ticket

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
- **DOH (Department of Highways) CCTV + flood coordinates** —
  https://hdms.doh.go.th/dashboard — highway-scoped, may overlap with or
  complement the existing BMA sensor source (`data.js` `loadBMA`).
- **TMD (Thai Meteorological Dept) rain radar** —
  https://weather.tmd.go.th (also a "Thai Weather" app) — upstream signal
  (rain, not flood state), could be a leading indicator rather than a
  Passability source.
- **BMA rainfall gauges** — https://weather.bangkok.go.th/rain
- **BMA road-flood monitoring** — https://weather.bangkok.go.th/flood/ —
  worth checking whether this is the same underlying data as the existing
  `BMA_API` (`floodbangkok.bangkok.go.th`) source or a distinct one.
- **BMA canal flow rates** — https://weather.bangkok.go.th/KlongMap —
  flagged in the source roundup as useful but frequently down ("ล่มบ่อยนิด
  นึงครับ กดรีเฟรชหลายครั้งจะได้"), i.e. flaky — same category of risk
  `docs/adr/0001` accepted for Traffy's undocumented endpoint, but worth
  weighing before depending on it.

## Third-party / private

- **Longdo Traffic** — https://traffic.longdo.com — likely the same
  underlying feed as this app's existing `LONGDO_EVENTS` source, or a
  related product from the same vendor. Worth checking for overlap.
- **BMA Traffic CCTV viewer** — https://cpudapp.bangkok.go.th/bmatraffic —
  already linked from this app's Camera pin popups (`app.js`).
- **GISTDA flood app**, **Windy** (https://www.windy.com) — rain radar,
  similar role to TMD above.
- **Google Flood Hub** — https://sites.research.google/floods — multi-day
  river-overflow forecasts by basin. Forecast, not current-state — different
  category from this app's "what's flooded right now" scope.
- **peoplesparty.or.th flood aggregator** — https://flood69.peoplesparty.or.th/
  — a similar aggregation effort to this app itself; worth a look for
  prior-art / sources they use that we don't.

## Emergency hotlines (not data sources, but noted for reference)

1784 ปภ. (rescue/evacuation, also LINE `@1784DDPM`) · 1669 (medical
emergency) · 1586 DOH / 1146 rural highways (route info) · 1129 PEA
(provincial electric) / 1130 MEA (Bangkok/Nonthaburi/Samut Prakan electric)

## Next step, whenever this gets picked up

Don't add a new source directly from this list — run it through
`/grill-with-docs` first (per `AGENTS.md`) the way Traffy was: confirm the
endpoint actually exists and is fetchable client-side (CORS, no auth), decide
its Passability-status trust level (see `CONTEXT.md`'s "Citizen report" for
how Traffy was capped), and record the decision as an ADR if it's a real
trade-off.
