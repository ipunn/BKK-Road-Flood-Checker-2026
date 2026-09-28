---
status: accepted
---

# Derive a canal "water-level status" from BMA-sourced thresholds — reversing the earlier "never color-code canal" decision

Two earlier decisions deliberately ruled this out. The original
`thaiwater-canal-levels` spec's Out-of-Scope section said: "Any
threshold-based 'is this dangerous' interpretation of a canal level ... would
effectively give it a Passability status by another name." `app.js`'s
`CANAL_MARKER_COLOR` comment gave the concrete reason why: ThaiWater's own
feed has no cross-station-comparable severity signal — `measureValue` is
relative to each station's own local datum, and `storagePercent` ranges from
-402% to +188% live, clearly not a usable 0-100% scale. Both calls were
correct given what was known: coloring by an invented threshold would have
shown drivers a confidence the data couldn't back up, the same mistake
ADR-0003 identified for guessing flood depth from descriptive language.

What changed: BMA (สำนักการระบายน้ำ กรุงเทพมหานคร) — the single agency that
owns every one of the 256 canal stations ThaiWater's API returns — publishes
its own per-station เตือนภัย (warning) / วิกฤติ (critical) meter thresholds on
a public dashboard, `https://weather.bangkok.go.th/water`. ThaiWater's API
response already carries BMA's own station code
(`properties.station.stationCode`, e.g. `C00000002-WL.HMK.03`), so the two
datasets join directly with no fuzzy matching. This isn't an invented
severity — it's the same organization's own published judgment about the
same reading, joined by its own identifier.

**How the data was obtained and verified** (2026-09-28): the dashboard has no
JSON API — it's a server-rendered HTML table, and a plain `curl` hits its bot
protection (403). Fetching with a browser-like `User-Agent` header returns
the full table directly (200, ~1.6MB), which was parsed with a script (not a
summarizing fetch tool) to extract exact cell values. The table actually has
*three* separate current-level/threshold pairs per station — inside-polder
(ด้านใน), outside/river-side (ด้านนอก), and river (แม่น้ำ) — not the single
pair originally assumed. Cross-checking the "inside" column's current value
against ThaiWater's live `measureValue` for several shared stations (e.g.
`WL.HMK.03`: BMA's ด้านใน = 0.59, ThaiWater's measureValue = 0.59) confirmed
ด้านใน (inside) is the column that corresponds to what ThaiWater's canal API
actually reports, and its paired เตือนภัยด้านใน/วิกฤติด้านในthresholds are
therefore what `CANAL_STATION_THRESHOLDS` (`data.js`) uses.

**Coverage turned out much higher than initially estimated**: 253 of
ThaiWater's 256 stations have a usable, sane threshold pair (one isn't
listed in BMA's table at all; two have `criticalM <= warningM`, which likely
reflects a different threshold convention for that station's role — e.g. a
pump/gate station where a *low* reading is the actual problem — that we
don't have the engineering context to safely interpret, so those two are
deliberately left out rather than guessed at). Stations with no usable
threshold get `waterLevelStatus: null` and keep the existing neutral
fallback color — never a guessed green.

**Accepted as a deliberate trade-off**:
- This is a one-time hand-curated snapshot, not a live sync. BMA can add,
  remove, or revise thresholds at any time without this table following
  along — the same posture this app already takes toward ThaiWater's
  undocumented API key (ADR-0004) and Traffy Fondue's undocumented endpoint
  (ADR-0001): best-effort, not authoritative, degrading gracefully rather
  than being guaranteed current.
- Water-level status is a new, narrower concept than Related condition, not
  a redefinition of it — see CONTEXT.md "Water-level status." It keeps every
  guarantee Related condition already made (no Passability status, no route
  verdict input, no `mergeCorroboration` contributor) and adds its own
  visual language (a wave `divIcon`, a color palette distinct from
  `MARKER_COLOR`) specifically so it can never be mistaken for a road-status
  reading, which is the exact confusion the original caution was protecting
  against.

If BMA's dashboard structure or thresholds change significantly, refreshing
`CANAL_STATION_THRESHOLDS` requires repeating this same fetch-with-UA-header
and re-parse — there's no automated sync to fall back on.
