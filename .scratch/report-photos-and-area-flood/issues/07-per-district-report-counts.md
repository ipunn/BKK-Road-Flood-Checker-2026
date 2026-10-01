# 07: Per-district report counts

**What to build:** Alongside the Area flood view, show how many reports each district has within a recent window (for example "12 reports in Bang Khen in the last 6 h"), so someone can compare areas at a glance. Counts are of reports, labelled as such, with no severity or "flooded level" implied.

**Blocked by:** 06

**Status:** done

- [ ] A pure function returns report counts per district for a given window; tests cover grouping, the window boundary, and districts with zero reports
- [ ] The UI shows the counts with the window stated and the wording makes clear they are report counts, not a flood level
- [ ] Selecting a district from the counts opens that area in the gallery
- [ ] Counts use the same placeholder-free, resolved-excluded reports as the gallery
- [ ] New text is Translated strings in Thai and English

## Comments

Window is 6 h, top 8 districts with reports shown as chips; counts come from the gallery photo list, so reports without a real photo are not counted. UI not browser-tested.
