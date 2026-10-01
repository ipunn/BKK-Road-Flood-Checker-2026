# BKK Road Flood 2026

Live, static, client-side map for checking flooded roads in Bangkok and planning
whether a car can get through — built during the September 2026 Bangkok flooding.

**Not an official channel.** For official warnings follow BMA, the Thai Meteorological
Department (TMD), and DDPM. BMA flood hotline: **1555**.

## What it does

- Pulls **live** flood reports from three public feeds directly in your browser, plus a
  fourth read-only canal water-level feed for context (no backend, no API key, no
  cached/mock data — if a feed is down, the status line says so instead of showing
  stale numbers as if they were fresh).
- Colour-codes each reported point by car passability using a simple depth threshold.
- Shows an at-a-glance summary (blocked / caution / clear) for all of Bangkok, or within 2 km of you after an opt-in "Current location" tap.
- Shows the citizen-submitted photo on a Traffy Fondue report, when one exists, so you
  can judge it yourself instead of trusting a status dot alone.
- Shows related layers (canal levels, BMA flooded-roads list, GISTDA 24 h warning) on by default, each switchable off from the chips on the map.

## Data sources

| Source | Endpoint | What it gives |
|---|---|---|
| [BMA road water-level sensors](https://floodbangkok.bangkok.go.th) | `.../floods/v1/items/sensor_profile` + `flood_notification` | ~254 fixed sensors across Bangkok roads, live depth in cm |
| [Longdo Traffic / iTIC](https://traffic.longdo.com) event feed | `event.longdo.com/feed/json` | Flood reports aggregated from DOH, BMA Drainage & Sewerage Dept., and iTIC contributors — nationwide, filtered here to a Bangkok bounding box |
| [Traffy Fondue](https://bangkok.traffy.in.th) citizen reports | `publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2` | BMA/NSTDA's official citizen issue-reporting channel, filtered to flood-tagged tickets. **Not sensor-confirmed** — capped at "caution" severity and merged with corroborating reports instead of shown standalone. Includes the citizen-submitted photo attached to each ticket, when one exists, shown on the map so you can judge it yourself. This is an undocumented endpoint (see [ADR-0001](docs/adr/0001-traffy-fondue-undocumented-endpoint.md)); it can change or break without notice. |
| [ThaiWater](https://www.thaiwater.net) canal water levels | `twa-api-public.thaiwater.net/v2/waterlevel/canal` | Canal-level readings near the map view, shown as a **Related condition**, not a road report — it never affects a road's own passability status. Uses ThaiWater's public fallback key, not a registered one of our own (see [ADR-0004](docs/adr/0004-thaiwater-public-key.md)); it can change or break without notice. |

All four endpoints are public and either send `Access-Control-Allow-Origin: *` (BMA,
Longdo) or otherwise permit direct browser fetches (Traffy, ThaiWater), which is why
this can run as a plain static page instead of needing a server-side proxy.

## Passability classification

For each reported point, depth (cm) is extracted from the sensor reading or report
text, then classified:

| Depth | Status | Meaning |
|---|---|---|
| < 10 cm | 🟢 ผ่านได้ (green) | Passable |
| 10–30 cm | 🟡 ผ่านได้แต่ระวัง (yellow) | Passable with caution / high-clearance vehicles only |
| > 30 cm | 🔴 ผ่านไม่ได้ (red) | Treat as impassable by car |
| unstated | ⚪ ไม่ทราบระดับน้ำ (gray) | Depth not reported — treated as caution, not "clear" |

A report explicitly saying "ผ่านไม่ได้" / "impassable" is always red regardless of any
parsed number. Thresholds are defined as constants at the top of `app.js` — adjust them
there if 10/30 cm doesn't match your vehicle's clearance.

Only points with a **currently active** report are shown: a BMA sensor reading with no
`end_flood` timestamp and reported within the last 3 hours, or a Longdo event whose
`stop` time hasn't passed (falls back to a 3-hour window if no `stop` is given). Roads
with no active report simply don't appear — this is a map of *known current hazards*,
not proof a road is clear.

## Running locally

No build step. Just serve the folder and open it:

```sh
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` directly via `file://` will NOT work — browsers block `fetch()`
from `file://` origins, so use a local server as above.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. Repo Settings → Pages → Source: **Deploy from a branch** → Branch: `main`, folder: `/ (root)`.
3. Your live URL will be `https://<username>.github.io/<repo-name>/`.

## Known limitations

- Coverage is limited to what BMA sensors and Longdo/iTIC contributors report — many
  flooded sois and minor roads won't have a sensor and may not appear at all.
- No routing engine: this is a manual "check the roads on my route" tool, not
  turn-by-turn navigation. Cross-reference with Google/Longdo Maps traffic layers.
- Depth-to-passability thresholds are a simplification — actual passability also
  depends on vehicle ground clearance, water flow speed, and submerged hazards
  (open manholes, debris) that no sensor reports.
