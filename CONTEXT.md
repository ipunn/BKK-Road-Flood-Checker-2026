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

**Report photo**:
A real image attached to a report — a citizen-submitted photo on a Citizen
report, or an image on an Event report — never the shared stock/placeholder
image Traffy Fondue attaches to tickets forwarded without one (see
docs/adr/0003). Its job is evidence a driver can judge for themselves, not a
severity signal: it never changes Passability status. Shown with a prominent
age label, and may be older than the report that carried it is allowed to
influence a route verdict — the photo's age window is independent of the
verdict's freshness window.
_Avoid_: Attachment, thumbnail (the thumbnail is just how a Report photo is
displayed)

**Area flood view**:
A lens over the existing reports and Report photos that answers "what is
flooded near here?" for a neighbourhood, lane, or community — not "can a car
pass this road?". Reuses the same Citizen/Event reports rather than splitting
them into a separate source (no text-based road-vs-area classification, per
docs/adr/0003). Carries no Passability status and is never a route-verdict
input; its evidence is the Report photo, the report text, and an age. Scoped
to Bangkok.
_Avoid_: Area flood report (implies a distinct report type or source, which
this deliberately isn't)

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
Upstream/contextual data (e.g. dam levels, canal discharge, rainfall, GISTDA
24 h flood-warning polygons (docs/adr/0008; the forecast layers are not shipped), BMA flood-centre's flooded-roads sheet) shown
for awareness only — each with a visible source and age label (or an explicit
"update time unknown" where the source gives none), off by default behind its
own toggle — never a Sensor report, Event report, or Citizen report.
It carries no Passability status, is never an input to a route verdict, and
is never a `mergeCorroboration` contributor. Exists to give drivers *some*
signal when report coverage is missing (most notably during a BMA outage),
not to replace a report. Shown unconditionally alongside reports, not gated
behind or specially promoted during a source outage — it's additive context,
not an outage fallback UI. The first instance, ThaiWater canal water-level
stations (`data.js` `loadThaiWaterCanal`), relies on an undocumented public
fallback API key — see ADR-0004. A second instance, BMA's flood-centre
flooded-roads Google Sheet (`data.js` `loadFloodCentreSheet`), is fetched on
first toggle, drawn as a diamond marker, and labelled "update time unknown"
because the sheet has no per-row timestamp; its coordinates are approximate and
its note text is BMA's own, shown verbatim and never parsed into a status.
_Avoid_: Leading indicator, upstream data (both used informally during
sourcing research; this is the canonical term going forward)

**Water-level status**:
A derived red/yellow/green/neutral signal shown only on canal water-level
stations (`data.js` `waterLevelStatus`), computed from a station's current
reading against its own BMA-published warning/critical thresholds
(`CANAL_STATION_THRESHOLDS`). A distinct concept from Passability status —
it carries the same "never a route-verdict input, never a
`mergeCorroboration` contributor" guarantees "Related condition" already
makes, and uses a visually distinct color palette (`CANAL_STATUS_COLOR` /
`--canal-status-*`) and marker shape (a wave `divIcon`, not a `circleMarker`)
so it's never mistaken for a road-status dot. Neutral (no color) whenever a
station has no sourced threshold — never defaults to green. See
docs/adr/0005-canal-water-level-status.md for why this exists despite the
earlier decision to never color-code canal stations.
_Avoid_: Severity, risk level (reserved for Passability status, per that
entry's own _Avoid_ note — using them here would blur the two systems this
term exists to keep apart)

**Translated string**:
App-authored UI text (labels, headings, status messages, legend copy) that
goes through the `i18n.js` dictionary and switches between Thai and English
with the language toggle. Includes static markup (`data-i18n` attributes)
and dynamic `app.js` template strings (via the `t()` helper). See
docs/adr/0006-client-side-language-toggle.md.
_Avoid_: Localized string, UI copy

**Source-language content**:
Text that names or is drawn verbatim from a live external feed or a real-world
place — road/place names from the BMA, Longdo/iTIC, and Traffy Fondue feeds
— and is deliberately never translated, even in English mode, because a
driver needs it to match physical signage. Not a Translated string, even
though both appear in the same UI. See
docs/adr/0006-client-side-language-toggle.md.
_Avoid_: Untranslated text (implies an oversight, not a deliberate choice)
