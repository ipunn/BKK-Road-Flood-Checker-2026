---
status: accepted
---

# Allow an opt-in "Use my location" for the near-me summary

ADR-0007 chose a district picker and place search over the browser Geolocation
API so nothing about the driver's position is requested. That held for the Area
flood view. The mobile redesign adds an answer-first summary, and the most useful
version of it is "blocked roads within 2 km of me".

Accepted, narrowly: the location is requested **only after the user taps "Use my
location"**, is held in a single in-memory variable, and is used only to filter
and sort reports in the browser. It is never sent to any server, never written to
storage or the URL, and is dropped on "Show all Bangkok" or reload. If permission
is denied, unavailable, or the position is outside Bangkok, the summary stays
city-wide and says why. The default summary uses no location at all.

ADR-0007's no-geolocation rule still applies to the Area flood view (district
picker / place search); this ADR carves out only the opt-in summary.
