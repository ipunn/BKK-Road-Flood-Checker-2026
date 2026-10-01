---
status: accepted
---

# Draw GISTDA's 24 h flood-warning tiles from an undocumented Cloud Run host

GISTDA LifeDee's 24-hour flood-warning grid is served as Mapbox vector tiles from
`check-water-map-service-726396821992.asia-southeast3.run.app/tiles/flood-warn/{z}/{x}/{y}.pbf`,
the host its own public map uses. It is undocumented, has no SLA, and is the same
class of trade-off as Traffy Fondue (ADR-0001) and ThaiWater's key (ADR-0004). The
tile host sends CORS headers; GISTDA's JSON API, which holds the generation
timestamps, does not (`.scratch/report-photos-and-area-flood/gistda-polygons-finding.md`).

Accepted: ship **only the 24 h warning layer**, on by default (a chip switches it off), as a Related
condition (no Passability status, never a route-verdict or `mergeCorroboration`
input). Because the app cannot read when a tile was generated, the legend says so
("area-level; update time unknown"). The forecast layers are not shipped: their
honest label needs a run time the browser cannot read, and d2/d3 tiles 404 in a way
that cannot be told from "no polygons". Tiles are rendered with Leaflet.VectorGrid
loaded from unpkg on first toggle — no build step, no API key.

If the host is renamed, blocked or removed, the toggle's up-front tile probe fails
and the layer shows its own "couldn't load" note; no other source is affected.
Recovery means finding the new host the way this one was found, or dropping the
layer. A 404 from the probe is treated as "no polygons here", so an empty tile and a
removed layer path can still look alike.
