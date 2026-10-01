---
status: accepted
---

# Loosen the Duty Board rules to allow motion polish

`DESIGN.md` originally banned soft blurred shadows, corners above 2px, and tinted
pills. A reference site (flood.pop.in.th) showed that motion and soft light make a
live flood board feel alive, and we want that without becoming a generic dashboard.

Accepted, narrowly:

- **Soft glow** is allowed only as a *signal*: a blocked pin's halo, a "live" dot, a
  refresh flash. Never as decoration.
- **Rounded corners** are allowed on interactive chrome (bottom sheet, chips,
  buttons). Stamp badges and map tags stay sharp.
- **Blurred shadows** are allowed for depth on the sheet and popups.
- **Status stays on stamp ink colour + shape.** Tinted translucent pills remain
  banned. The warm board palette is unchanged (no navy/teal shift).
- **No hero.** The three-number summary stays first (PRODUCT.md
  principle 2).
- **Motion budget:** `transform`/`opacity` only; `prefers-reduced-motion` collapses
  every effect to an instant state change; no animation library or build step;
  nothing loops except live and loading signals; animations pause on hidden tabs.
- **Water motif** only on Related-condition canal markers (and a one-shot rise-in
  under the summary). It never uses stamp colours and never implies a Passability
  status — see Water-level status in `CONTEXT.md`.

Considered and rejected: the full cool-blue glass rebrand and an illustrated hero
(both slow the glance and discard the Duty Board identity); a water gauge tied to
the blocked count (a second competing verdict).
