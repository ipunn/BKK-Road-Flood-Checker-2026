# 11: GISTDA flood polygon layer + ADR

**What to build:** An off-by-default **Related condition** layer showing GISTDA's flood-warning and forecast polygons, using the labels established by ticket 10. It carries no Passability status and is never a route-verdict input or corroboration contributor. It needs a way to draw vector tiles on this static site, and an ADR recording the dependency on an undocumented host.

**Blocked by:** 10

**Status:** done (24 h warning layer only — see Comments)

- [ ] The layer has its own toggle chip, off by default, visually distinct from road dots and canal wave icons
- [ ] Each layer shows source, whether it is a warning or a forecast, and its validity, using ticket 10's wording in Thai and English
- [ ] Vector tiles are rendered without introducing a build step or an API key
- [ ] A failed or blocked tile request shows an unavailable state and does not affect any other source
- [ ] An ADR records the undocumented-host dependency and the fallback (drop the layer), in the style of ADR-0001 and ADR-0004
- [ ] The glossary entry for Related condition matches what shipped
- [ ] No effect on route verdicts, Passability status, or `mergeCorroboration`

## Comments

Deferred 2026-10-01: validity times are only in a CORS-closed API (see ../gistda-polygons-finding.md), so the layer could only say "update time unknown", and an empty tile cannot be told from a failed one. Reopen if GISTDA exposes timestamps with CORS open or a documented endpoint. If shipped anyway, ship only the 24 h warning layer.

Shipped 2026-10-01 per user go-ahead: 24 h warning layer only, labelled "update time unknown" (docs/adr/0008). Forecast days not shipped. Tile failure is detected by an up-front probe tile fetch; Leaflet.VectorGrid is loaded lazily from unpkg. Not browser-verified.
