# 08: Canal percent-of-bank and trend

**What to build:** Each canal water-level station shows how close its level is to the bank (percent of bank) and its trend versus the previous reading (rising, falling, steady), using data the app already fetches. This stays a **Related condition**: it keeps **Water-level status** semantics, never a Passability status, never a route-verdict input.

**Blocked by:** None (can start immediately)

**Status:** done (partial — see Comments)

- [ ] Percent-of-bank is computed only when the station has a sourced bank/threshold figure; otherwise it shows nothing rather than a guess
- [ ] Trend compares to the previous reading and handles first load, equal readings, and missing previous values; tests cover each case
- [ ] The station popup/list shows both values with a unit and an age label
- [ ] Neutral (no color) behaviour for stations without thresholds is preserved
- [ ] No effect on route verdicts, `mergeCorroboration`, or road status dots
- [ ] New text is Translated strings in Thai and English

## Comments

The ThaiWater canal feed has no bank figure and no previous-reading field (`percentageDiff` is undocumented), so percent-of-bank was NOT implemented. Shipped instead: trend vs the previous distinct reading (kept in session memory) and margin to BMA critical level (m). Needs a decision if percent-of-bank is still wanted (would need a sourced bank figure).
