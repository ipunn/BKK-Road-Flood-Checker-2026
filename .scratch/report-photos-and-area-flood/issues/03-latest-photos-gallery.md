# 03: "Latest photos" gallery (Traffy)

**What to build:** The tracer bullet. A "Latest photos" section in the sidebar that lists every real **Report photo** from Traffy Fondue **Citizen reports** the feed still holds, newest first. Each item shows the thumbnail, a prominent age label, the place name, and a source tag. It is independent of the freshness dropdown and of route verdicts (ADR-0007): reports older than the verdict window appear here only as photos, never as map markers with a status, and resolved or cancelled tickets are hidden. A single pure function owns the logic (window, ordering, paging); the sidebar renders it.

**Blocked by:** 01, 02

**Status:** done

- [ ] A pure gallery function takes parsed reports plus "now", a page size, and an offset, and returns items sorted newest first with age, place, source, photo URL and a link back to the report, plus whether more items exist
- [ ] Tests cover ordering, paging by limit/offset, reports older than the verdict window still included, resolved/cancelled tickets excluded, and placeholder images never included
- [ ] The sidebar shows 12 items initially with a "show more" control that loads the next 12; thumbnails lazy-load
- [ ] Each item's age label is the most prominent element and updates with the existing refresh cycle
- [ ] Tapping an item pans the map to its report and opens that report's popup
- [ ] The gallery ignores the freshness dropdown; changing the dropdown does not change the gallery
- [ ] Route verdicts, Passability status and marker behaviour are unchanged
- [ ] All new user-visible text is a Translated string in Thai and English; place names stay as source-language content
- [ ] Layout works one-handed on a phone and follows `DESIGN.md`
