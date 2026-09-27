# BKK Road Flood 2026

Live, static, client-side map for checking flooded roads in Bangkok and planning
whether a car can get through — built during the September 2026 Bangkok flooding.

**Not an official channel.** For official warnings follow BMA, the Thai Meteorological
Department (TMD), and DDPM. BMA flood hotline: **1555**.

## What it does

- Pulls **live** flood reports from two public feeds directly in your browser (no
  backend, no API key, no cached/mock data — if a feed is down, the status line says so
  instead of showing stale numbers as if they were fresh).
- Colour-codes each reported point by car passability using a simple depth threshold.
- Lets you build a "my route" list by clicking points on the map or in the road list,
  and gives a plain-language verdict (ผ่านได้ / ผ่านได้แต่ระวัง / ผ่านไม่ได้) for the
  worst point on that list.

## Data sources

| Source | Endpoint | What it gives |
|---|---|---|
| [BMA road water-level sensors](https://floodbangkok.bangkok.go.th) | `.../floods/v1/items/sensor_profile` + `flood_notification` | ~254 fixed sensors across Bangkok roads, live depth in cm |
| [Longdo Traffic / iTIC](https://traffic.longdo.com) event feed | `event.longdo.com/feed/json` | Flood reports aggregated from DOH, BMA Drainage & Sewerage Dept., and iTIC contributors — nationwide, filtered here to a Bangkok bounding box |

Both endpoints are public, unauthenticated, and send `Access-Control-Allow-Origin: *`,
which is why this can run as a plain static page instead of needing a server-side proxy.

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
