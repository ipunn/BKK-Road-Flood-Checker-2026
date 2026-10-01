# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Bangkok drivers and commuters deciding, in the moment, whether to leave and which
road to take during active flooding — and, since ADR-0007, anyone in Bangkok
asking what is flooded in their own neighbourhood, lane, or community — not just
the original requester but anyone they share the link with. Primary viewing context is mobile, one-handed, in a car
or on the street: outdoor glare, possibly patchy signal during storms, glancing
quickly rather than reading carefully. Desktop/pre-trip planning is a secondary
context.

## Product Purpose
Answer one question fast: what is flooded near here right now? For roads that
means the original question — can a car get through this road? It aggregates live
Bangkok flood-sensor and citizen-report data, classifies each reported road point
by car passability, and lets a driver see which reported roads near them are
blocked before or during a trip. For neighbourhoods, lanes, and communities it shows
recent reports and their photos by area (the Area flood view), with no
passability verdict. See docs/adr/0007.

## Positioning
Unlike the underlying official/aggregator feeds it draws from, this tool converts
raw sensor and report data into a direct passability verdict (clear / caution /
blocked) for each reported road, with visible data freshness rather than
presenting live-look numbers that may already be stale. Passability stays the
core claim for roads; area flooding is shown as dated evidence (reports and
photos), never as an inferred verdict.

## Operating Context
Used during an active, ongoing flood event (started ~Sept 2026). Viewed on phones
outdoors, often quickly, sometimes with degraded connectivity. Data sources
(BMA sensors, Longdo/iTIC reports) can go stale or fail independently; the product
must never present old data as if it were current.

## Capabilities and Constraints
- Static site, no backend, no build step, no API keys — fetches BMA and Longdo/iTIC
  public feeds directly from the browser.
- Free hosting via GitHub Pages; the user has no deployment background, so anything
  requiring server infra, paid services, or CLI-only workflows is out of scope.
- Two pages: a map with a status summary, and a data-sources/freshness page.
- Bilingual-leaning Thai-first copy (the primary UI language is Thai; the working
  title is English).

## Brand Commitments
None binding. Working title "BKK Road Flood 2026" is open to redesign (name
treatment, colors, type, identity) in full. Not personally attributed branding is
not required, but the tool should read as a serious situational utility, not a
personal hobby page or a generic AI-generated dashboard template.

## Evidence on Hand
Live data verified in-session against the real BMA (floodbangkok.bangkok.go.th) and
Longdo/iTIC (event.longdo.com) feeds on 2026-09-27, during the active flood. No
mockups, testimonials, or design references supplied by the user.

## Product Principles
1. Never show stale data as if it were fresh — visible timestamps and explicit
   failure states over confident-looking but outdated numbers.
2. Optimize for a fast glance under pressure, not for browsing or exploration.
3. Passability is the product's core claim — the visual system must make
   clear/caution/blocked instantly distinguishable, including at a glance in poor
   outdoor lighting.
4. Stay a serious civic/safety utility in tone and craft — not a toy demo, not a
   generic template.

## Accessibility & Inclusion
High-contrast requirement given outdoor mobile use in bright glare. No other
accessibility requirement specified beyond that operating-context need.
