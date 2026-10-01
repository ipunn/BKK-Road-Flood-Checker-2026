# 05: Longdo event images in the gallery

**What to build:** **Event reports** from Longdo/iTIC that carry an image appear in the "Latest photos" gallery as **Report photos**, tagged with their source, alongside the Traffy photos in one newest-first list. A Report photo never changes Passability status.

**Blocked by:** 01, 03

**Status:** done

- [ ] The Longdo parser exposes an event's image URL as a Report photo when present and as none when absent; fixture tests cover both
- [ ] Only flood-related Event reports are included, using the same flood filter the app already applies
- [ ] The gallery merges Traffy and Longdo photos into one list ordered by report time, each tagged with its source
- [ ] Expired events (past stop time or the fallback expiry) are excluded
- [ ] Tapping a Longdo item pans to its report and opens the popup
- [ ] Image URLs from the feed are escaped/validated the same way Traffy photo URLs are
- [ ] Passability status, verdicts and corroboration are unchanged
