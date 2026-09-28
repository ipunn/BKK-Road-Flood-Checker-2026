# BKK Road Flood 2026

A live Bangkok flood-passability map. It aggregates reports from multiple public
sources into a single per-road verdict (clear / caution / blocked) for drivers
deciding whether a route is passable right now.

## Language

**Sensor report**:
A flood point sourced from a fixed BMA road-water-level sensor (`data.js`
`loadBMA`). Closes on an explicit `end_flood` field or a fixed staleness window,
whichever comes first.
_Avoid_: BMA point, sensor data

**Event report**:
A flood point sourced from the Longdo/iTIC nationwide traffic-event feed,
filtered to the Bangkok metro area (`data.js` `loadLongdo`). Closes on an
explicit `stop` field or a fixed fallback expiry, whichever comes first.
_Avoid_: Longdo point, iTIC report

**Citizen report**:
A flood point sourced from Traffy Fondue, BMA/NSTDA's official public
issue-reporting channel — not a Sensor report or Event report. Its passability
severity is capped at caution: it can never independently produce a blocked
verdict, since a single citizen submission isn't sensor-confirmed. Closes on
its status field resolving, or a fixed fallback expiry, whichever comes first.
_Avoid_: Unverified report, crowdsourced report (implies anonymous/uncontrolled
input, which this isn't — Traffy Fondue is an official, moderated channel)

**Corroboration**:
Two or more reports — from the same source or different sources — that refer
to the same real-world flood point, judged by proximity (~300m) and both
falling within the same freshness window. Corroborated reports are merged into
a single map marker instead of shown as separate pins, with each contributing
report listed as evidence.

**Camera pin**:
A BMA public traffic-camera location shown on the map, independent of any
flood report. It carries no passability status of its own — it links out to
BMA's viewer (generic homepage only; no BMA camera supports a link to its own
specific view) rather than showing a status or contributing to a route
verdict. Sourced from a vendored snapshot, not a live fetch — see ADR-0002.
_Avoid_: CCTV point, camera marker (this app's map already uses "marker" for
report pins — "pin" keeps the two visually and conceptually distinct)

**Passability status**:
The clear / caution / blocked / unknown verdict assigned to a single report or
to a selected route (the worst status among its reports). Carried by ink color
and stamp shape in the UI, per `DESIGN.md`.
_Avoid_: Severity, risk level

**Related condition**:
Upstream/contextual data (e.g. dam levels, canal discharge, rainfall) shown
for awareness only — never a Sensor report, Event report, or Citizen report.
It carries no Passability status, is never an input to a route verdict, and
is never a `mergeCorroboration` contributor. Exists to give drivers *some*
signal when report coverage is missing (most notably during a BMA outage),
not to replace a report. Shown unconditionally alongside reports, not gated
behind or specially promoted during a source outage — it's additive context,
not an outage fallback UI. The first instance, ThaiWater canal water-level
stations (`data.js` `loadThaiWaterCanal`), relies on an undocumented public
fallback API key — see ADR-0004.
_Avoid_: Leading indicator, upstream data (both used informally during
sourcing research; this is the canonical term going forward)
