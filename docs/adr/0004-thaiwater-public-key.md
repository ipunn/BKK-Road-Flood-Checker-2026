---
status: accepted
---

# Use ThaiWater's undocumented public fallback API key, not a registered key

ThaiWater TWA's canal water-level API (`twa-api-public.thaiwater.net/v2/waterlevel/canal`)
requires an `x-api-key` header on every request. There's no public self-service
registration flow for this app to obtain its own key. Instead, `data.js`'s
`loadThaiWaterCanal()` sends `TPSXrHRvTHeVT2Lygq6YeTqqAm4xZ72x` — the exact
fallback key ThaiWater's own official JS bundle sends when a visitor to its
public map isn't signed in, found by inspecting that bundle's network calls.
This is the same undocumented-but-public category of trade-off as Traffy
Fondue's endpoint (ADR-0001): no SLA, no guarantee it keeps working, and it
could be rotated or removed by ThaiWater at any time without notice, silently
breaking every request this app makes with it.

Accepted as a deliberate trade-off to keep the site fully static (no backend,
no credential-holding proxy, no registration process to gate a driver-facing
feature on), consistent with `PRODUCT.md`'s capabilities and constraints. If
ThaiWater rotates or removes this fallback key, `loadThaiWaterCanal()`'s
request starts failing outright (likely a 401/403). That failure is caught by
the same `Promise.allSettled` degradation path every other source failure
uses — see `CONTEXT.md`'s "Related condition" — so the canal water-level
panel/card goes to its empty/error state and nothing else in the app is
affected. There is no automatic fallback to a different canal data source;
recovering requires either finding a new fallback key the same way this one
was found, or dropping the ThaiWater Related condition feature entirely.
