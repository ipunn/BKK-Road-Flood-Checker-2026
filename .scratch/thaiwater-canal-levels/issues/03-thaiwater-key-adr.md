# 03: Document the ThaiWater public-key trade-off as an ADR

**What to build:** A new ADR, mirroring
`docs/adr/0001-traffy-fondue-undocumented-endpoint.md`, explaining why this
app relies on ThaiWater TWA's undocumented public fallback API key (shipped
in ThaiWater's own JS bundle for anonymous users) rather than a key
registered specifically for this app — the trade-off, and what breaks if
ThaiWater changes or revokes that fallback key.

**Blocked by:** 01 (should reflect the actual confirmed key-usage mechanics
found while building `loadThaiWaterCanal()`, not a guess made before
implementation)

**Status:** done

- [x] `docs/adr/0004-thaiwater-public-key.md` created, following the same
      structure/tone as ADR-0001 and ADR-0002.
- [x] States what the fallback key is, where it comes from, and why it was
      used instead of registering a dedicated key.
- [x] States the risk: what happens to the feature if ThaiWater rotates or
      removes the fallback key, and how that failure would present (same
      independent-degradation behavior as any other source failure, per
      ticket 01).
- [x] Cross-referenced from `CONTEXT.md`'s "Related condition" entry the
      same way ADR-0001 and ADR-0002 are already referenced from their
      relevant `CONTEXT.md` terms.
