# 03: Add ThaiWater canal stations as map markers

**Status:** done

## Report

User: "how user see data from thaiwater on the map?" — ThaiWater canal
water-level data only appeared as a text list in the sidebar's "Related
conditions" panel, never as anything on the map itself. Asked to explore
adding a map marker.

## Investigation

Fetched the live feed to size the problem before designing anything:

- **252 stations fall inside the app's Bangkok bounding box** (of 255
  nationwide) — almost as many as BMA's ~254 road sensors. Showing all of
  them unconditionally would be a second full layer of pins on top of
  BMA/Longdo/Traffy/route markers.
- Checked whether the feed has any field that reliably means "this station
  currently has a problem," since the user's first instinct was to only
  show stations that do:
  - `measureValue` (level in meters) ranges **-4.2 to 1.78** live, but is
    relative to each station's own local datum, not a shared reference —
    no fixed threshold works across all 252 stations.
  - `storagePercent` looked like a normalized 0–100% fill metric but
    ranges **-402.5 to +188** live — not actually a clean percentage scale.
  - No `warning`/`bankHeight`/threshold field exists in the response at
    all.
  - Conclusion: there's no severity signal in this feed we can trust
    without inventing one — the same category of problem
    `docs/adr/0003-no-qualitative-depth-inference.md` already rejected for
    Traffy/Longdo text (never guess a severity the data doesn't actually
    support).

Presented this finding to the user before building anything, since it
directly affected what they'd asked for (an "issue-only" filter and a
color-coded severity scale, both originally requested).

## Decisions (user-confirmed)

- **Visibility**: an opt-in toggle button (`#canal-toggle` in `index.html`,
  next to the existing `#camera-toggle`), off by default — same pattern as
  the ~230-pin CCTV camera layer. Shows all 252 stations when on; no
  proximity or severity filtering.
- **Color**: a single neutral color (`--canal-blue: #4d7a91` in
  `style.css`) for every marker, deliberately never a red/yellow/green/gray
  Passability color, since there's no trustworthy scale to code by.
- Unlike camera pins (a one-time static fetch triggered by the toggle
  itself), canal data was already being fetched on every refresh cycle
  regardless of toggle state (the sidebar panel needs it either way) — so
  the toggle here only controls the *map layer's visibility*, not the
  fetch.

## Implementation

- `canalMarkersLayer` (`app.js`): a new Leaflet layer group, not added to
  the map by default, mirroring `camerasLayer`.
- `renderCanalMarkers()`: rebuilds the layer from `canalStations` on every
  `refreshThaiWater()` cycle (whether currently shown or not), each a
  `circleMarker` in `CANAL_MARKER_COLOR`, popup showing station name,
  level in meters, age, and an explicit "ข้อมูลบริบท ไม่ใช่รายงานสภาพถนน"
  ("context info, not a road-condition report") note — same wording the
  sidebar panel already uses.
- Canal markers carry no Passability `status`, are not merged via
  `mergeCorroboration()`, and can't be added to a route — same
  restrictions as camera pins, consistent with `CONTEXT.md`'s "Related
  condition" definition.
