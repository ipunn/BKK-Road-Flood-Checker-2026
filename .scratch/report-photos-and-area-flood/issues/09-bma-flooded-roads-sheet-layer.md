# 09: BMA flooded-roads sheet layer

**What to build:** An off-by-default **Related condition** layer showing BMA's flood-centre flooded-roads list, with its own toggle chip. The source has no per-row timestamp, so every item is labelled "update time unknown" and the layer never implies freshness. It carries no Passability status, is never a route-verdict input, and is never merged with road reports. It is visually distinct from road dots and canal wave icons.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] A pure parser turns the sheet's response into items (road, segment, plain-language note, approximate coordinates); fixture tests cover well-formed rows and rows with missing or non-numeric coordinates, and out-of-Bangkok coordinates
- [ ] The layer is off by default behind its own toggle chip
- [ ] Every item shows its source (BMA flood centre) and an explicit "update time unknown" label; coordinates are described as approximate
- [ ] A failed or empty fetch shows a clear unavailable state and does not affect any other source
- [ ] No Passability status, no `classify`, no corroboration merging, no route-verdict input
- [ ] The glossary entry for Related condition matches what shipped
- [ ] New text is Translated strings in Thai and English; road names stay as source-language content
