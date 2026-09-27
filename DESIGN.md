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
flood report, log its depth and time, judge whether a route can proceed — is
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
route panel. Map markers are pin-and-tag shapes (a small rotated paper tag on
a pin), not flat circle dots. No soft blurred drop shadows anywhere — depth
comes from small hard-edged offset shadows (`2px 2px 0`), like a paper cutout,
never a blurred elevation shadow.

## Shapes

Sharp corners throughout (`0–2px` radius) — a duty board has no rounded
plastic UI chrome. Stamped elements (badges, the route verdict) carry a slight
fixed rotation (stamps land crooked) and a double-ruled border instead of a
solid fill.

## Components

- **Stamp badge** (replaces the old tinted pill): outlined rectangle in the
  status ink color, uppercase mono/display label, rotated -2deg, no fill.
- **Route verdict**: a large stamp-style mark ("ROUTE BLOCKED" / "PROCEED WITH
  CAUTION" / "ROUTE CLEAR"), rotated, ink-colored border and text on the board
  surface — not a filled colored box.
- **Map marker**: custom divIcon paper tag with a brass pin head; tag border
  color = status ink color; depth value in mono type on the tag.
- **Duty-log row** (road list / route list item): ruled row, mono timestamp
  column right-aligned, no rounded hover card — hover darkens the row only.
- **Tab button** (nav, refresh, freshness filter): flat rectangular tab,
  mono uppercase label, brass underline when active.

## Do's and Don'ts

- Do carry status via ink color + stamp shape; don't reintroduce translucent
  tinted rounded pill badges.
- Do use hard offset shadows or none; don't use soft blurred box-shadows.
- Do keep corners sharp (0–2px); don't default back to 6–12px rounded cards.
- Do keep the map itself (Leaflet pan/zoom/popups) using standard, expected
  interaction — the duty-board treatment styles the chrome and markers, it
  never degrades map usability for a driver under pressure.
- Don't let the paper/stamp texture reduce contrast below what outdoor glare
  requires — status ink colors are chosen for AA contrast against `board`.
