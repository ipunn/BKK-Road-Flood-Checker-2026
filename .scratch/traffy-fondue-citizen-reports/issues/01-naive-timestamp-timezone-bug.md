# 01: Longdo/Traffy naive timestamps parsed in viewer's local timezone instead of Bangkok time

**Status:** done

## Report

User observed, checking the map around 2026-09-28 02:00 local Bangkok time,
a Traffy Fondue citizen report shown as "2 ชม.ที่แล้ว" (2 hours ago) whose
attached photo was clearly taken in daylight — inconsistent with a report
truly only 2 hours old at 2am.

## Root cause

Confirmed live against both feeds (fetched 2026-09-28 ~09:33 Bangkok /
02:33 UTC):

- BMA (`floods/v1/items/flood_notification`): `date_created` /
  `start_flood` arrive as full ISO 8601 with an explicit `Z`, e.g.
  `"2026-09-28T02:20:00.000Z"` — unambiguous UTC, parses correctly
  regardless of viewer timezone.
- Longdo/iTIC (`event.longdo.com/feed/json`): `start`/`stop` arrive as
  `"2026-09-28 09:28:54"` — matches Bangkok local time (UTC+7), **no
  timezone marker at all**.
- Traffy Fondue (`teamchadchart-stat-api/geojson/v2`): `timestamp` /
  `last_activity` arrive the same way, e.g. `"2026-09-28 09:31:47"` —
  also naive Bangkok local time.

`data.js`'s `parseDateMs()` — the single function `ageMinutes()` and
`timeAgoTh()` both go through, used everywhere `.updated` is displayed or
checked for staleness — does `new Date(String(s).replace(" ", "T"))` on
these strings. A date-time string with no `Z`/offset is parsed by the JS
spec as **local time in whatever timezone the running device is set to**,
not Bangkok time. For a viewer whose device timezone is anything other
than Asia/Bangkok (a phone with the wrong system timezone, a browser in
UTC, a traveler's device, testing/CI environments, etc.), every
Longdo/Traffy report's computed age is silently wrong by exactly that
timezone's offset from +07:00 — old reports can appear artificially fresh
(matches what was observed) or fresh ones artificially stale/expired.

`loadTraffy()` additionally had its own second, unguarded copy of this
same naive parse (`now - new Date(ts).getTime()`) for the closure/expiry
check, independent of `parseDateMs()`.

BMA is unaffected — its feed already carries an explicit `Z`.

## Fix

- `parseDateMs()` (`data.js`): detect whether the string already carries a
  timezone marker (`Z`/`z` or a trailing `±HH:MM`/`±HHMM` offset); if not,
  append `+07:00` before parsing. This is the one place all `.updated`
  reads funnel through (`ageMinutes`, `timeAgoTh`, `mergeCorroboration`'s
  recency check), so the fix is centralized rather than per-source.
- `loadTraffy()`'s closure/expiry check now calls `parseDateMs()` instead
  of its own duplicate inline `new Date(...)` parse, removing the second
  place this bug could hide.
- Added `node:test` cases: a naive `"YYYY-MM-DD HH:MM:SS"` string parses
  as Bangkok time regardless of test-runner timezone; a `Z`-suffixed or
  offset-suffixed string is left untouched.

## Comments

- Confirmed via live `curl` against both feeds at investigation time
  (`floodbangkok.bangkok.go.th`, `event.longdo.com`,
  `publicapi.traffy.in.th`) rather than assumed from docs, since neither
  feed publishes a timestamp-format spec.
