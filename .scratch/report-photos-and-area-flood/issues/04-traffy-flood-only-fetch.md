# 04: Flood-only Traffy fetch with fallback

**What to build:** Fetch Traffy Fondue with the flood-only query so the feed reaches back roughly 25 hours (instead of about 13 hours of mixed categories), widening what the gallery can show. If that query fails or returns nothing usable, fall back to the plain call. If both fail, the gallery states plainly that it is incomplete, rather than silently showing a shorter list. Note the new undocumented dependency in ADR-0001's addendum (already added; keep it accurate).

**Blocked by:** 01

**Status:** done

- [ ] The loader requests the flood-only query first and uses the plain call as a fallback on failure or an empty/invalid response
- [ ] The parser handles both response shapes; fixture tests cover each
- [ ] When both calls fail, the existing source-failure state reports Traffy Fondue as unavailable
- [ ] Verified against the live feed that more flood tickets and a longer age range are returned than before
- [ ] Map markers and route verdicts still obey the existing freshness/expiry rules (only the available photo window grows)
- [ ] ADR-0001's addendum matches the shipped behaviour

## Comments

Live check 2026-10-01: plain feed = 69 flood tickets over ~13 h (00:49-14:02); flood-only = 300 over ~25 h (09-30 14:00 - 10-01 14:39). ADR-0001 addendum matches shipped behaviour. UI not browser-tested in this session.
