# 10: Decode GISTDA flood-warn / forecast polygons

**What to build:** A written finding, no shipped code, that establishes what GISTDA LifeDee's flood-warning and 1–3 day flood-forecast polygons actually mean: what each layer and polygon property represents, what time each polygon is valid for, how often it updates, and how to label it honestly. Read GISTDA's own site and shipped client code, not secondary write-ups. This unblocks the GISTDA layer ticket.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] The finding states, with citations to the primary source, what the warning layer and each forecast-day layer represent
- [ ] It documents each polygon property that matters (meaning, units/values) and where the validity time comes from
- [ ] It records update cadence and whether a stale tile can be recognized from the data
- [ ] It proposes the exact label wording the layer should show (source, forecast vs warning, validity) in Thai and English
- [ ] It records remaining unknowns and any hosting/availability risk observed (undocumented Cloud Run host, CORS behaviour)
- [ ] Written under this effort's `.scratch` folder; no application code changed

## Comments

Finding: ../gistda-polygons-finding.md. Key result: validity times are only in a CORS-closed API, so the layer can only carry "update time unknown" labels. Ticket 11 needs a user decision.
