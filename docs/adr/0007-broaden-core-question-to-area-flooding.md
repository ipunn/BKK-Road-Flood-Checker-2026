---
status: accepted
---

# Broaden the core question from "can a car pass this road?" to "what is flooded near here?"

The app was built around one question — can a car get through this road right
now? — and every concept (Passability status, route verdicts, the Bangkok
road filter) serves it. Fewer Traffy Fondue reports are now being filed, which
weakened the one feature that gave a driver evidence for themselves (the
citizen photo), and road-only framing also excludes the much larger audience
whose question is about a neighbourhood, lane, or community rather than a
driveable road. We chose to broaden the core question to "what is flooded near
here?", with road passability kept as one kind of answer, over the narrower
alternative of keeping road passability as the sole core and bolting area
flood on as a side feature.

What this does and does not change:

- **Passability status stays the core claim for roads.** Route verdicts, the
  clear/caution/blocked system, and the Sensor/Event/Citizen severity rules
  are untouched. The new **Area flood view** (see `CONTEXT.md`) carries no
  Passability status and is never a route-verdict input — the same
  separation Water-level status and Related condition already keep.
- **No new report type and no text-based road-vs-area split.** Area flood is
  a lens over the same Citizen and Event reports and their **Report photos**,
  not a classification of them. Deciding "this ticket is a lane, not a road"
  from free text would be the same kind of guess ADR-0003 rejects.
- **Report photo age is independent of the verdict's freshness window.**
  Photos can be shown up to the age the upstream feed still holds (about 12
  hours), labelled by age; the 1h/3h window still governs markers and
  verdicts. Resolved or cancelled tickets stay hidden.
- **Bangkok only for now.** "More coverage" means more kinds of flooding, not
  more geography. Going nationwide would change every source's filtering and
  is a separate decision.
- **No device location.** Area lookup is a district picker / place search, not
  the browser Geolocation API, so nothing about the driver's position is
  requested or used.

A future reader seeing road-only verdict code alongside area-wide documentation
should not "unify" them by giving area flood a Passability status or by
inferring road-vs-area from report text — the split is deliberate. See
`PRODUCT.md` for the updated product framing.

> Amended by docs/adr/0009: an opt-in "Current location" now exists for the near-me summary only; the Area flood view still uses no device location.
