---
status: accepted
---

# Use Traffy Fondue's undocumented public-map endpoint, not its documented Exchange API

Traffy Fondue's official "Exchange API" (`publicapi.traffy.in.th`, documented at
github.com/traffy-nectec/exchange-api-doc) requires a registered Bearer JWT for
every read endpoint — unusable from static client-side JS without exposing a
credential (the API is also bidirectional, so a leaked token could write/update
tickets). Instead, this app calls
`https://publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2`: the same
unauthenticated, CORS-open endpoint the official `bangkok.traffy.in.th` public
map itself uses to render citizen reports, discovered by inspecting that page's
own network calls. It has no published docs, no SLA, and could change or be
locked down without notice — accepted as a deliberate trade-off to keep the
site fully static (no backend, no API keys), consistent with `PRODUCT.md`'s
capabilities and constraints. If this endpoint breaks, the fallback is either a
small credential-holding proxy for the documented Exchange API, or dropping the
Citizen report source entirely — not "just switch to the documented API," since
that requires infrastructure this project deliberately doesn't have.

Addendum (see docs/adr/0007): the plain endpoint returns only the latest 300
tickets of all categories (~13 h today). Adding `?problem_type=น้ำท่วม` returns
300 flood-only tickets reaching back ~25 h at a similar payload size, which the
Report photo gallery needs for its ~12 h window. That query parameter is
equally undocumented, so the plain call stays as the fallback if it breaks.
