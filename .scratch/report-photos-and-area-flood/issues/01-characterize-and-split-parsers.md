# 01: Characterize and split the Traffy and Longdo parsers

**What to build:** A behaviour-preserving prefactor. Capture what the Traffy and Longdo loaders produce today on a fixture, then separate parsing from fetching so each source has a pure parser (taking "now" as a parameter) with a thin fetch wrapper around it, following the existing canal-station pattern. The app looks and behaves exactly as before.

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] A characterization test records the current Traffy output for a fixture response before any change, and still passes after the split
- [ ] Traffy and Longdo each expose a pure parser tested with fixtures, with no network and no DOM
- [ ] Traffy parser tests cover: placeholder-photo filtering (the 3+ repeated-URL rule and the known stock URL), resolved/cancelled tickets, expired tickets, and out-of-Bangkok tickets
- [ ] Longdo parser tests cover expired events and events with no stop time
- [ ] Existing tests still pass and the map/sidebar behave unchanged
