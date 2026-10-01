# 06: Area flood view: district picker and place search

**What to build:** Choosing a district or searching a place turns the gallery into the **Area flood view** for that area: reports and **Report photos** in the chosen area, newest first with age labels. No device location is requested. When the list is empty, the view says "no recent reports" and "nearest data is too old or too far to say" as distinct messages, and never reads as "dry". First step of the ticket: verify how clean Traffy's `district` and `subdistrict` values are, and decide the district list source from that.

**Blocked by:** 03

**Status:** done

- [ ] The ticket opens with a short finding on district/subdistrict value quality (spelling variants, blanks, non-Bangkok values) and the resulting district list source
- [ ] The gallery function accepts an area and filters by district or place match; tests cover matching, no match, and variants found in the data
- [ ] The gallery function reports an empty-state reason distinguishing "no recent reports in the area" from "nearest data is stale or far"; tests cover both
- [ ] The UI offers a district picker and a place search, both optional; clearing returns the full gallery
- [ ] No Geolocation API is used and nothing about the user's position is requested
- [ ] The Area flood view carries no Passability status and affects no route verdict
- [ ] New text is Translated strings in Thai and English; district and place names stay as source-language content

## Comments

District/subdistrict finding (live, 2026-10-01, 300 flood tickets): `district` and `subdistrict` were never blank, all Thai names of Bangkok districts, no `เขต` prefix seen (the matcher still strips one defensively). Only 22 of 50 districts had reports, so the picker uses a vendored list of all 50 (`BANGKOK_DISTRICTS`) rather than the districts present in the data. Longdo events have no district field, so they match by place text only, not the district picker.

Scope notes: the view lists Report photos only (reports without a real photo are not shown there). Empty-state split: "stale" = newest photo anywhere is older than the 3 h verdict window; "none" = feed is current but the area has nothing. "Far" is not modelled, since there is no device location. UI not browser-tested.
