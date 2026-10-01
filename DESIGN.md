---
name: Duty Board
description: Bangkok flood-ops situation board — pinned map tags, a clipboard duty log, and hand-stamped verdicts instead of a generic dark SaaS dashboard.
colors:
  board: "#1c1815"
  board-panel: "#241f1a"
  board-line: "#3a332c"
  paper: "#e8e2d3"
  ink: "#d8d2c2"
  ink-dim: "#8f867a"
  brass: "#b8863b"
  stamp-red: "#d9614a"
  stamp-amber: "#c98a2c"
  stamp-chalk: "#e8e2d3"
  stamp-gray: "#6f6a60"
typography:
  display:
    fontFamily: "'Oswald', 'Noto Sans Thai', sans-serif"
    fontWeight: 600
    letterSpacing: "0.04em"
    textTransform: "uppercase"
  body:
    fontFamily: "'IBM Plex Sans', 'Noto Sans Thai', sans-serif"
    fontWeight: 400
  data:
    fontFamily: "'IBM Plex Mono', 'Noto Sans Thai', monospace"
    fontWeight: 400
rounded:
  none: "0px"
  tag: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  stamp-badge:
    backgroundColor: "transparent"
    textColor: "{colors.stamp-red}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
  tab-button:
    backgroundColor: "{colors.board-panel}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "5px 12px"
---

## Overview

**Creative north star: "The Duty Board."** The product's real mechanism — pin a
flood report, log its depth and time, judge whether a road can be passed — is
already a disaster-response situation-room object: a pinned board map with a
clipboard duty log beside it, status marked by hand-stamped ink rather than
colored pills. This direction executes that object directly instead of a
generic dark analytics dashboard. Assigned via the impeccable concept seed
(operate mode) from a 7-direction Bangkok/Thai-civic materials list; confirmed
with the user over a generic "excellent plain dashboard" standing-exit
alternative.

Audience: Bangkok drivers glancing at a phone outdoors, often in rain, low
light, or glare, deciding fast whether a road is passable. Every device here
must survive a two-second glance, not reward close reading.

## Mobile and answer-first layout

The top of the sidebar (and the peek strip of the mobile bottom sheet) is a
three-number summary — blocked / caution / clear — before any list or toggle.
At <=720px the map fills the screen and the sidebar is a bottom sheet whose
collapsed peek strip always shows that summary. A light theme was tried and
rejected in favour of this dark Duty Board palette.

## Colors

Warm near-black board tone, not neutral slate — evokes cork/board material lit
by a single work lamp, not a generic "dark mode" gray. Status is carried by
**stamp ink color + shape**, never by a translucent tinted pill:

- `board` (#1c1815) / `board-panel` (#241f1a): base surfaces.
- `board-line` (#3a332c): hairline rules, ruled clipboard lines.
- `paper` (#e8e2d3): tag/stamp ground, primary light text on dark board.
- `ink` (#d8d2c2) / `ink-dim` (#8f867a): body text, secondary text.
- `brass` (#b8863b): hardware accent — nav underline, focus ring, pin heads.
- `stamp-red` / `stamp-amber` / `stamp-chalk` / `stamp-gray`: the four
  passability states (blocked / caution / clear / unknown). `stamp-chalk` is
  paper-toned, not green — "clear" is the absence of an alarming mark, the way
  an unremarkable duty-log entry carries no red ink.

## Typography

Three roles, no default system sans anywhere:

- **Display** — Oswald, condensed uppercase, tracked out: stamped headers,
  nav, section eyebrows, badges. Reads like stencilled board lettering.
- **Body** — IBM Plex Sans: road names, descriptions, running Thai/English copy.
- **Data** — IBM Plex Mono: timestamps, depth values, sensor codes, ages —
  anything that reads like a duty-log entry.

Thai text (`Noto Sans Thai`) rides the same three roles as a fallback/pairing,
never a fourth face.

## Layout

Sidebar reads as a physical clipboard: ruled horizontal lines between rows
(not rounded card separators), a bulldog-clip visual accent at the top of the
sidebar panel. Map markers are pin-and-tag shapes (a small rotated paper tag on
a pin), not flat circle dots. Depth on stamps, tags and rows comes from small
hard-edged offset shadows (`2px 2px 0`), like a paper cutout; only the bottom
sheet and popups may use a soft blurred shadow (ADR-0010).

## Shapes

Sharp corners on stamps, tags and rows (`0–2px` radius). Interactive chrome
(bottom sheet, chips, buttons) may be rounded (ADR-0010). Stamped elements (badges) carry a slight
fixed rotation (stamps land crooked) and a double-ruled border instead of a
solid fill.

## Components

- **Stamp badge** (replaces the old tinted pill): outlined rectangle in the
  status ink color, uppercase mono/display label, rotated -2deg, no fill.
- **Map marker**: custom divIcon paper tag with a brass pin head; tag border
  color = status ink color; depth value in mono type on the tag.
- **Duty-log row** (road list item): ruled row, mono timestamp
  column right-aligned, no rounded hover card — hover darkens the row only.
- **Tab button** (nav, refresh, freshness filter, gallery "show more"): flat rectangular tab,
  mono uppercase label, brass underline when active.

## Motion

Decided in ADR-0010; chosen from a three-way prototype (branch `prototype/motion`,
variant C "Water"). All of it is `transform`/`opacity`, wrapped in
`prefers-reduced-motion: no-preference`, with no library.

- **Summary**: a water-blue wave rises once behind the peek strip / summary
  panel (1500ms) and then stays still. A count that changes fades up (520ms).
  The wave is tied to no number and carries no verdict.
- **Pins**: a pin that was not on the map before fades in (520ms, blocked first,
  14ms stagger, capped 420ms). A newly blocked pin also gets two one-shot ripples
  in `stamp-red` — water colours never mean "blocked".
- **Refresh**: manual refresh only (never the 3-min auto refresh) spins the icon
  and plays a one-shot water wash over the map.
- **Canal markers**: only warning/critical stations bob — the one looping
  effect; paused while the tab is hidden.

## Do's and Don'ts

- Do carry status via ink color + stamp shape; don't reintroduce translucent
  tinted rounded pill badges.
- Do use hard offset shadows on stamps, tags and rows; soft blurred shadows are
  allowed only for depth on the bottom sheet and popups (ADR-0010).
- Do keep stamps and map tags sharp (0–2px); rounded corners are allowed only on
  interactive chrome — sheet, chips, buttons (ADR-0010).
- Do use soft glow only as a signal (blocked-pin halo, live dot, refresh flash),
  never as decoration.
- Do keep motion to `transform`/`opacity`, respect `prefers-reduced-motion`, and
  loop only live/loading signals; no animation library, no build step.
- Don't let water motion use stamp colours or imply a Passability status; it
  lives only on Related-condition canal markers and a one-shot rise-in.
- Do keep the map itself (Leaflet pan/zoom/popups) using standard, expected
  interaction — the duty-board treatment styles the chrome and markers, it
  never degrades map usability for a driver under pressure.
- Don't let the paper/stamp texture reduce contrast below what outdoor glare
  requires — status ink colors are chosen for AA contrast against `board`.
