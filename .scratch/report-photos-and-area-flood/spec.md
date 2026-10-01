Status: ready-for-agent

# Report photo gallery and Area flood view

Background: ADR-0007 (core question broadened), ADR-0001 (Traffy endpoint),
ADR-0003 (no severity inference from text). Research: `.scratch/peer-site-research/notes.md`.
Vocabulary below is from `CONTEXT.md`: **Report photo**, **Area flood view**,
**Citizen report**, **Event report**, **Related condition**, **Passability status**.

## Problem Statement

Fewer people are filing Traffy Fondue reports now, so the one feature that lets a
driver judge a flood for themselves — the citizen photo — shows less and less. With
the default 1-hour freshness filter the map currently shows no Traffy reports at
all, even though dozens of flood tickets (most with real photos) exist from the
last several hours. Photos are also only reachable by tapping a marker, and only
for reports young enough to count toward a road verdict.

Separately, the product only answers "can a car get through this road?". Many
people's real question is "what is flooded in my neighbourhood, lane, or
community?" — a much larger audience — and about a third of flood tickets never
mention a road at all.

## Solution

A **Latest photos** gallery in the sidebar: every real **Report photo** the feeds
still hold (about 12 hours or more), newest first, each with a prominent age label,
place name, and source tag. It is independent of the freshness dropdown and of
route verdicts. Choosing a district or searching a place turns the same gallery
into the **Area flood view** for that area, which also refuses to say "dry" when
the nearest data is far or stale. Related conditions gain two labelled,
off-by-default layers (GISTDA flood warning/forecast polygons and the BMA
flood-centre flooded-roads sheet), and canal stations gain percent-of-bank and
trend. Road Passability status and route verdicts are unchanged.

## User Stories

1. As a driver, I want to see the latest real photos of flooding in Bangkok even when no report is under an hour old, so that I still have evidence to judge from.
2. As a driver, I want every photo labelled with how old it is, so that I never mistake a hours-old photo for current conditions.
3. As a driver, I want photos sorted newest first, so that the most relevant evidence is at the top.
4. As a driver, I want to tap a photo and have the map jump to its report and open its popup, so that I know exactly where it was taken.
5. As a driver, I want each gallery item to show the place name and source (Traffy Fondue or Longdo), so that I can judge how much to trust it.
6. As a driver on mobile with poor signal, I want only 12 photos loaded at a time with a "show more" button, so that the page stays usable in a storm.
7. As a driver, I want photos to lazy-load, so that photos I never scroll to don't cost data.
8. As a driver, I want the stock call-centre logo image never shown as a photo, so that I'm not invited to "look at the photo" when there isn't one.
9. As a driver, I want resolved or cancelled tickets' photos hidden, so that I don't act on a flood the authority has already closed.
10. As a resident, I want to pick my district, so that I only see flooding in my area.
11. As a resident, I want to search for a place name, so that I can check an area I'm not sure the district name of.
12. As a resident, I want the area view to list reports and photos within the chosen area newest first with age labels, so that I can see what is happening around me.
13. As a resident, I want per-district report counts (for example "12 reports in Bang Khen in the last 6 h"), so that I can compare areas at a glance.
14. As a resident, I want the app to say "no recent reports" differently from "nearest data is too old or too far to say", so that an empty list never reads as "dry".
15. As a resident, I want the area view to use no device location, so that nothing about where I am is requested or sent anywhere.
16. As a driver, I want route verdicts and Passability status to behave exactly as before, so that adding area features doesn't change how roads are judged.
17. As a driver, I want a Report photo's age window kept separate from the verdict's freshness window, so that an old photo can be shown without ever affecting a verdict.
18. As a user, I want Longdo event images included alongside Traffy photos, so that I see every available piece of evidence.
19. As a user, I want the gallery to keep working if the Traffy flood-only query stops working, so that the feature degrades to a shorter window rather than disappearing.
20. As a user, I want a clear error state when a photo source fails, so that I'm told the gallery is incomplete rather than shown a silently shorter list.
21. As a user, I want everything I read — headings, age labels, empty states, source tags — in Thai by default and English via the existing toggle, so that the new UI matches the rest of the app.
22. As a user, I want place and road names from the feeds left untranslated, so that I can match them to real signage.
23. As a canal-watcher, I want each canal station to show how close it is to the bank (percent of bank) and its trend versus the previous reading, so that I can tell whether it is rising.
24. As a user, I want GISTDA flood warning and forecast polygons available as an off-by-default layer with a visible source and validity label, so that I get area-level context without it being mistaken for a road verdict.
25. As a user, I want the BMA flood-centre flooded-roads sheet available as an off-by-default layer labelled "update time unknown", so that official judgement is visible without implying freshness.
26. As a user, I want those two layers visually distinct from road status dots and canal wave icons, so that I never confuse them with a Passability status.
27. As a maintainer, I want the new layers to follow the Related condition rules (no Passability status, no route-verdict input, no corroboration merging), so that road verdict logic stays pure.
28. As a maintainer, I want Thai and English dictionaries checked for matching keys by a test, so that the many new strings can't drift.
29. As a maintainer, I want Traffy and Longdo parsing separated from fetching, so that photo rules are testable with fixtures.
30. As a maintainer, I want the gallery logic in one pure function, so that windowing, ordering, area filtering, paging, and the honest empty state can be tested without the DOM.

## Implementation Decisions

- **Core framing:** ADR-0007 broadens the question to "what is flooded near here?"; Passability status stays the core claim for roads. `CONTEXT.md` and `PRODUCT.md` already updated.
- **Parser split (prerequisite refactor, behaviour-preserving):** `loadTraffy` and `loadLongdo` each become a thin fetch wrapper around a pure parser exposed on `FloodData` — `parseTraffy(geojson, now)` and `parseLongdo(events, now)` — following the existing `parseCanalStations` / `loadThaiWaterCanal` pattern. Parsers for the BMA flooded-roads sheet and GISTDA data are added the same way. Each parser takes "now" as a parameter.
- **Traffy fetch:** use the flood-only query (`problem_type=น้ำท่วม`, roughly 25 h of tickets) with the plain call as a fallback if it fails. Undocumented, so noted in ADR-0001's addendum.
- **Report photo rules (unchanged where they exist):** placeholder detection stays (URL repeated across 3+ tickets, plus the known stock URL as a fallback). Longdo `images` URLs count as Report photos on Event reports. A Report photo never changes Passability status.
- **Photo age window is independent of the verdict window:** reports older than the existing 3 h Traffy fallback expiry still appear in the gallery (never as map markers with status dots or verdict inputs) up to the oldest the feed holds; resolved or cancelled Traffy tickets are hidden. The freshness dropdown does not apply to the gallery.
- **`buildGallery(reports, { now, area, limit, offset })`:** one new pure `FloodData` function. Input: parsed reports (with photo and timestamp). Output: sorted (newest first) gallery items — each with age, place name, source, photo URL, and a link back to its report — plus paging info and an empty-state reason (`none-recent` vs `data-stale-or-far`). Area filtering is by district or place match; per-district counts are a second output added after the list ships.
- **Area lookup:** district picker and place search; no Geolocation API. The district list is sourced from the `district`/`subdistrict` values Traffy tickets already carry; its cleanliness is unverified and is the first thing the area ticket must check.
- **Sidebar UI:** "Latest photos" section reuses the existing sidebar/list patterns; 12 items per page with "show more"; `loading="lazy"` thumbnails; tapping an item pans to the report and opens its popup (reusing the existing popup that already shows a photo thumbnail). Age label is the headline element of an item. Visual design follows `DESIGN.md`.
- **Related conditions:** two new layers — GISTDA LifeDee flood-warn/flood-forecast polygons and the BMA flood-centre flooded-roads sheet. Both follow the Related condition rules, are off by default behind their own toggle chips, show a visible source and age/validity label, and use visuals distinct from road dots and canal wave icons. The BMA sheet is labelled "update time unknown" because it has no per-row timestamp.
- **GISTDA decode ticket is a hard blocker:** the meaning of the `flood-warn` and `flood-forecast` polygon properties and their validity times is not known; the GISTDA layer must not ship until a ticket decodes and documents it. The layer also needs a vector-tile renderer the static site doesn't have yet, served from an undocumented Cloud Run host (same risk class as ADR-0001/0004; a new ADR is expected).
- **Canal stations:** add percent-of-bank and trend versus the previous reading, using data already fetched.
- **i18n:** all new app-authored text goes through the `i18n.js` dictionary (Translated string); feed-sourced place and road names remain Source-language content.
- **Dependencies on undocumented endpoints:** ADR-0001-class risk applies to the Traffy flood-only query, the GISTDA tiles, and the BMA sheet; each needs a graceful failure state.

## Testing Decisions

- A good test here exercises external behaviour of a pure function with fixtures — what goes in, what comes out — not how it's built. No network, no DOM.
- **Seam 1, existing — `FloodData` parsers with fixtures (`data.test.js`):** `parseTraffy` (placeholder filtering including the 3+ rule and the known stock URL, resolved and expired tickets, flood-only response shape, out-of-Bangkok tickets), `parseLongdo` (`images` field present/absent, expired events), BMA-sheet and GISTDA parsers, and canal percent-of-bank / trend.
- **Seam 2, new — `buildGallery`:** ordering, area filtering, paging (limit/offset), the independent photo window, resolved tickets excluded, and both empty-state reasons.
- **Characterization test first:** before splitting `loadTraffy`, capture its current output on a fixture so the refactor demonstrably preserves behaviour.
- **i18n key-parity test (`i18n.test.js`):** assert Thai and English dictionaries expose the same keys.
- **Prior art:** `parseCanalStations`, `nearestStations`, `waterLevelStatus` tests in `data.test.js` (builder helpers like `canalFeature` / `canalResponse`); `i18n.test.js` for dictionary tests.
- **Not tested:** DOM/map/popup rendering, the vector-tile layer, live endpoints.

## Out of Scope

- Municipal CCTV link-outs and camera-only-if-live (needs unverified camera image access).
- Emergency-numbers strip and large-text mode (parked as separate small items).
- Nationwide coverage — Bangkok only.
- Device geolocation / "near me" button.
- Heat or density layers over reports (would imply a severity the data can't support).
- Splitting Traffy tickets into road vs area report types by text (ADR-0003, ADR-0007).
- HII radar, rain tiles, and the other sources ranked in the research notes.
- Any change to Passability status, route verdicts, or corroboration logic.

## Further Notes

- Today's feed (2026-10-01): the plain Traffy call holds ~13 h and ~69 flood tickets (~61 with real photos); the flood-only query reaches back ~25 h. About 31% of flood tickets in a 24 h sample never mention a road or soi — evidence the area view is real, not hypothetical.
- Open unknowns from the research: GISTDA polygon semantics, how BMA edits the flooded-roads sheet, and Traffy district/subdistrict cleanliness.
- Suggested ticket order: (1) characterization test + parser split, (2) i18n key-parity test, (3) Longdo `images` + Traffy flood-only fetch, (4) `buildGallery` + sidebar gallery, (5) area filter (district picker/search, then counts), (6) canal percent-of-bank/trend, (7) BMA sheet layer, (8) GISTDA decode, (9) GISTDA layer + ADR.
