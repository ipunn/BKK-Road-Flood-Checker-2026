// Shared data-fetching, classification, and formatting logic.
// Used by both index.html (map) and sources.html (data & freshness page).
// Exposed as window.FloodData — plain script, no bundler/build step.
// Also loadable under Node's test runner (no `window` there), hence globalThis.

(function () {
  const globalTarget = typeof window !== "undefined" ? window : globalThis;
  const BMA_API = "https://floodbangkok.bangkok.go.th/bkk/dds/services/api/floods/v1/items/";
  const LONGDO_EVENTS = "https://event.longdo.com/feed/json";
  // Undocumented, unauthenticated endpoint behind the official public Traffy
  // Fondue map (bangkok.traffy.in.th) — see docs/adr/0001 for why this is
  // used instead of Traffy's documented, auth-gated Exchange API.
  const TRAFFY_API = "https://publicapi.traffy.in.th/teamchadchart-stat-api/geojson/v2";
  // ThaiWater TWA's own map UI's canal-water-level GeoJSON endpoint — unpaginated,
  // grouped by basin. Requires the "x-api-key" header below: ThaiWater's official
  // JS bundle falls back to this exact public key whenever no signed-in user
  // token is present, so it's the same undocumented-but-public category as the
  // Traffy endpoint above. See CONTEXT.md "Related condition" and (once written)
  // docs/adr/0004 for the trade-off.
  const THAIWATER_CANAL_API = "https://twa-api-public.thaiwater.net/v2/waterlevel/canal";
  const THAIWATER_API_KEY = "TPSXrHRvTHeVT2Lygq6YeTqqAm4xZ72x";
  // Traffy attaches this exact stock "ศูนย์กทม. 1555" call-center logo as
  // photo_url on tickets forwarded without an actual citizen photo — not a
  // real per-report image. Confirmed live: ~56% of tickets share this one
  // URL verbatim while every genuine upload has a distinct one. Treated as
  // "no photo" so we never invite a user to "look at the photo" for evidence
  // that isn't there.
  const TRAFFY_PLACEHOLDER_PHOTO_URL =
    "https://storage.googleapis.com/traffy_public_bucket/attachment/2022-12/da2125e781282589d482070c3dba1726aa16a4a7.jpg";

  const REFRESH_MS = 3 * 60 * 1000; // 3 min, matches BMA sensor refresh cadence
  const BMA_STALE_MS = 3 * 60 * 60 * 1000; // ignore BMA notifications older than 3h
  const LONGDO_FALLBACK_MS = 3 * 60 * 60 * 1000; // if a Longdo report has no "stop", expire after 3h
  // Absolute ceiling applied even when a Longdo report DOES have a `stop`.
  // Some entries carry a `stop` that rolls forward with the current day
  // (observed live: start=2026-01-30, stop still "today 23:59:59" almost 8
  // months later) — trusting `stop` alone can keep a dead report "active"
  // indefinitely. Set well above the longest legitimate multi-day highway
  // advisory observed live (~18.5 days) so real ongoing reports aren't
  // dropped early, but well below the observed anomaly (~241 days).
  const LONGDO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const TRAFFY_FALLBACK_MS = LONGDO_FALLBACK_MS; // same 3h closure fallback, reused per spec
  const STALE_WARN_MIN = 60; // flag a point as "stale" in the UI past this age

  // Depth thresholds (cm) for car passability — adjustable, transparent.
  const THRESH_YELLOW = 10; // >=10cm: passable with caution / high clearance only
  const THRESH_RED = 30; // >30cm: treat as impassable by car

  const STATUS_RANK = { red: 3, yellow: 2, gray: 1, green: 0 };
  const STATUS_LABEL_TH = {
    red: "ผ่านไม่ได้",
    yellow: "ผ่านได้แต่ระวัง",
    green: "ผ่านได้",
    gray: "ไม่ทราบระดับน้ำ",
  };
  const STATUS_BADGE = { red: "BLOCKED", yellow: "CAUTION", green: "CLEAR", gray: "UNKNOWN" };

  // The Longdo/iTIC feed is nationwide (it includes reports from other provinces, e.g.
  // Chon Buri) — this app is Bangkok-scoped, so we filter to a generous Bangkok
  // metropolitan bounding box. BMA's own feed is Bangkok-only already, no filter needed.
  const BKK_BBOX = { latMin: 13.49, latMax: 13.95, lngMin: 100.33, lngMax: 100.93 };
  function inBangkok(lat, lng) {
    return lat >= BKK_BBOX.latMin && lat <= BKK_BBOX.latMax && lng >= BKK_BBOX.lngMin && lng <= BKK_BBOX.lngMax;
  }

  function parseDepthCm(text) {
    if (!text) return null;
    const m = String(text).match(/(\d+(?:\.\d+)?)\s*(?:ซม|cm)/i);
    return m ? parseFloat(m[1]) : null;
  }

  // trustedDepth: true only for a directly-measured sensor reading (BMA) —
  // that's authoritative, so a vague/partial text mention like "small cars
  // can pass" must not be allowed to downgrade it. For Longdo/Traffy,
  // depthCm is itself only ever regex-scraped from this same free text, so
  // the explicit-claim override is at least as reliable as the number.
  function classify(depthCm, text, { trustedDepth = false } = {}) {
    const t = (text || "").toLowerCase();
    // "ไม่สามารถผ่าน(ได้)?" ("cannot pass") is a fixed Thai idiom that
    // contains "ผ่านได้" verbatim — matched here FIRST so it can't fall
    // through to the positive-passable check below. Deliberately NOT a
    // generic "ไม่ ... ผ่านได้ within N characters" window: that also
    // matched unrelated negations sharing the sentence (e.g. "ไม่หนัก
    // ผ่านได้สบายๆ" — "ไม่" negates "หนัก", not "ผ่านได้" — which must stay
    // "green"), so this only matches the specific fixed collocation.
    if (/ผ่านไม่ได้|ไม่สามารถผ่าน(?:ได้)?|impassable|not\s*passable/i.test(t)) return "red";
    // An explicit "passable" claim is evidence about the actual outcome, not
    // a guess — same footing as the "impassable" check above, and checked
    // before any parsed depth figure so a stray/unrelated cm number in the
    // same text (a historical peak, a different spot) can't override it. See
    // docs/adr/0003.
    if (!(trustedDepth && depthCm != null) && /ผ่านได้|passable/i.test(t)) return "green";
    if (depthCm != null) {
      if (depthCm > THRESH_RED) return "red";
      if (depthCm >= THRESH_YELLOW) return "yellow";
      return "green";
    }
    return "gray";
  }

  // A Citizen report (Traffy Fondue) is a single unverified submission, so it
  // can never independently produce a "blocked" verdict — see CONTEXT.md.
  function capCitizenSeverity(status) {
    return status === "red" ? "yellow" : status;
  }

  // A malformed date string (`new Date(...).getTime()`) yields NaN, which
  // is `!= null` — so callers doing `x != null` staleness checks would treat
  // an unparseable date as a valid, very-far-future timestamp instead of
  // "no date at all". Normalized to null here so every such check behaves
  // the same as a genuinely missing field.
  function parseDateMs(s) {
    if (!s) return null;
    const ms = new Date(String(s).replace(" ", "T")).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  function ageMinutes(iso) {
    const ms = parseDateMs(iso);
    if (ms == null) return Infinity;
    return (Date.now() - ms) / 60000;
  }

  function timeAgoTh(iso) {
    if (!iso) return "ไม่ทราบเวลา";
    const mins = Math.round(ageMinutes(iso));
    if (mins < 1) return "เมื่อสักครู่";
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hrs = Math.round(mins / 60);
    return `${hrs} ชม.ที่แล้ว`;
  }

  async function fetchJSON(url, extraHeaders) {
    const res = await fetch(url, { headers: { Accept: "application/json", ...extraHeaders } });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return res.json();
  }

  async function loadBMA() {
    const [profileRes, notifRes] = await Promise.all([
      fetchJSON(BMA_API + "sensor_profile?limit=-1"),
      // NOTE: sort=-date_created is unreliable on this feed — many rows come back with
      // date_created:null and out of order. -id is a reliable insertion-order proxy for
      // "most recent report", and start_flood (never null in samples) is used for the
      // actual age/staleness check and display timestamp.
      fetchJSON(BMA_API + "flood_notification?limit=500&sort=-id"),
    ]);
    const profiles = new Map((profileRes.data || []).map((p) => [p.id, p]));

    const latestBySensor = new Map();
    for (const n of notifRes.data || []) {
      const sid = n.sensor_profile;
      if (latestBySensor.has(sid)) continue; // already sorted desc by id (most recent first)
      latestBySensor.set(sid, n);
    }

    const points = [];
    for (const [sid, profile] of profiles) {
      const notif = latestBySensor.get(sid);
      if (!notif) continue;
      const ts = notif.start_flood || notif.date_created;
      const age = ts ? Date.now() - new Date(ts).getTime() : Infinity;
      const active = !notif.end_flood && age < BMA_STALE_MS;
      if (!active) continue; // only surface points with a currently-active report

      const depthCm = parseFloat(notif.value);
      const text = notif.text;
      points.push({
        key: `bma-${sid}`,
        label: profile.road || profile.name,
        sublabel: `${profile.name} · ${profile.district || ""}`,
        status: classify(depthCm, text, { trustedDepth: true }),
        depthCm,
        updated: ts,
        source: "BMA",
        lat: profile.lat,
        lng: profile.long,
        text,
      });
    }
    return { points, sensorCount: profiles.size, notificationCount: (notifRes.data || []).length };
  }

  async function loadLongdo() {
    const events = await fetchJSON(LONGDO_EVENTS);
    const now = Date.now();
    const points = [];
    let floodEventCount = 0;
    for (const e of events) {
      if (e.icon !== "flood") continue;
      floodEventCount++;
      const lat = parseFloat(e.latitude);
      const lng = parseFloat(e.longitude);
      if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;

      const stopMs = parseDateMs(e.stop);
      const startMs = parseDateMs(e.start);
      // No `stop` at all: use the tight LONGDO_FALLBACK_MS (our only
      // staleness signal). A `stop` present: trust it, but still cap age at
      // LONGDO_MAX_AGE_MS — see that constant's comment for why `stop` alone
      // isn't safe to trust indefinitely. See CONTEXT.md "Event report".
      const stopExpired = stopMs != null && stopMs < now;
      // Age-cap only kicks in when there's a `start` to measure it from.
      // `stop` present but `start` missing isn't observed in the live feed
      // (every flood event currently carries both) — in that theoretical
      // case, trust `stop` alone rather than dropping a report `stop` says
      // is still active. Only when NEITHER is present is there truly no
      // signal at all, so that's the one case treated as expired outright.
      const maxAgeMs = stopMs != null ? LONGDO_MAX_AGE_MS : LONGDO_FALLBACK_MS;
      const ageExpired = startMs != null ? now - startMs > maxAgeMs : stopMs == null;
      const expired = stopExpired || ageExpired;
      if (expired) continue;

      const text = `${e.title_en || e.title || ""} — ${e.description_en || e.description || ""}`;
      const depthCm = parseDepthCm(text);

      points.push({
        key: `longdo-${e.eid}`,
        label: e.title_en || e.title,
        sublabel: e.description_en || e.description || "",
        status: classify(depthCm, text),
        depthCm,
        updated: e.start ? e.start.replace(" ", "T") : null,
        source: `Longdo/iTIC${e.contributor ? " · " + e.contributor : ""}`,
        lat,
        lng,
        text,
      });
    }
    return { points, eventCount: events.length, floodEventCount };
  }

  async function loadTraffy() {
    const geojson = await fetchJSON(TRAFFY_API);
    const features = geojson.features || [];
    const now = Date.now();
    const points = [];
    let floodTicketCount = 0;

    // A real citizen-uploaded photo gets a unique per-ticket URL (observed:
    // content-addressed, e.g. .../attachment/<yyyy-mm>/<hash>.<ext>). A URL
    // repeated across multiple tickets in this same fetch is therefore a
    // shared stock/placeholder image, not real evidence — this is how we
    // caught the "ศูนย์กทม. 1555" call-center logo (reused on ~56% of
    // tickets observed live) without hardcoding that one URL, so detection
    // still works if Traffy adds or rotates placeholder assets.
    // TRAFFY_PLACEHOLDER_PHOTO_URL is kept as a belt-and-suspenders fallback
    // for a fetch too small to show the duplication. See docs/adr/0003.
    const photoUrlCounts = new Map();
    for (const f of features) {
      const u = f.properties && f.properties.photo_url;
      if (u) photoUrlCounts.set(u, (photoUrlCounts.get(u) || 0) + 1);
    }
    // Threshold of 3+ rather than "any duplicate" — two tickets legitimately
    // sharing one photo (a resubmission, or two citizens uploading the same
    // shot) is plausible; the actual placeholder repeats two orders of
    // magnitude more than that (168 of 300 tickets observed live), so 3+
    // still catches it with room to spare while not zeroing out a real but
    // coincidentally-duplicated photo.
    const isRealPhoto = (url) =>
      !!url && url !== TRAFFY_PLACEHOLDER_PHOTO_URL && photoUrlCounts.get(url) < 3;

    for (const f of features) {
      const props = f.properties || {};
      const types = props.problem_type_fondue || (props.type ? [props.type] : []);
      if (!types.includes("น้ำท่วม")) continue;
      floodTicketCount++;

      const coords = f.geometry && f.geometry.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords; // GeoJSON order — swapped to this app's {lat, lng}
      if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;

      // Status can be reverted (per research), so closure never trusts it
      // alone — see CONTEXT.md "Citizen report" and docs/adr/0001.
      const resolved = /เสร็จสิ้น|ไม่เกี่ยวข้อง|finish/i.test(
        `${props.state || ""} ${props.state_type_latest || ""}`
      );
      const ts = props.timestamp ? props.timestamp.replace(" ", "T") : null;
      const age = ts ? now - new Date(ts).getTime() : Infinity;
      const expired = age > TRAFFY_FALLBACK_MS;
      if (resolved || expired) continue;

      const text = `${props.description || ""} ${props.address || ""}`;
      const depthCm = parseDepthCm(text);

      points.push({
        key: `traffy-${props.ticket_id || f.id}`,
        label: props.address || props.subdistrict || "รายงานจากประชาชน",
        sublabel: `${props.subdistrict || ""} ${props.district || ""}`.trim(),
        status: capCitizenSeverity(classify(depthCm, text)),
        depthCm,
        updated: ts,
        source: "Traffy Fondue",
        lat,
        lng,
        text,
        photoUrl: isRealPhoto(props.photo_url) ? props.photo_url : null,
      });
    }

    return { points, ticketCount: features.length, floodTicketCount };
  }

  // ThaiWater's canal-water-level response is a GeoJSON FeatureCollection per
  // basin id — flattened here across every basin rather than hardcoding the
  // Chao Phraya basin id, since a station right at Bangkok's edge could be
  // grouped under a neighboring basin. inBangkok() below is what actually
  // scopes the result to Bangkok, same as loadLongdo()/loadTraffy().
  // A station is deliberately NOT report-shaped (no `status`, `depthCm`, or
  // report-shaped `source`) — see CONTEXT.md "Related condition".
  function parseCanalStations(raw) {
    const basins = (raw && raw.data) || {};
    const stations = [];
    for (const basinId of Object.keys(basins)) {
      const features = (basins[basinId] && basins[basinId].features) || [];
      for (const f of features) {
        const coords = f.geometry && f.geometry.coordinates;
        if (!coords) continue;
        const [lng, lat] = coords; // GeoJSON order — swapped to this app's {lat, lng}
        const props = f.properties || {};
        const levelM = props.measureValue;
        if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;
        if (typeof levelM !== "number" || isNaN(levelM)) continue;

        const st = props.station || {};
        stations.push({
          key: `thaiwater-canal-${st.id}`,
          label: st.station || "สถานีวัดระดับน้ำคลอง",
          lat,
          lng,
          levelM,
          updated: props.measureAt || null,
        });
      }
    }
    return stations;
  }

  async function loadThaiWaterCanal() {
    const raw = await fetchJSON(THAIWATER_CANAL_API, { "x-api-key": THAIWATER_API_KEY });
    const stations = parseCanalStations(raw);
    return { stations, stationCount: stations.length };
  }

  const MERGE_DISTANCE_M = 300; // corroboration radius — see CONTEXT.md "Corroboration"

  // Haversine distance in meters between two lat/lng pairs.
  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Points within MERGE_DISTANCE_M of each other, both still within the
  // existing freshness window, refer to the same real-world flood point —
  // merge them into one marker (see CONTEXT.md "Corroboration") instead of
  // showing duplicate pins. Union-find so a chain of nearby points (a-b-c)
  // merges transitively even if a and c themselves are far apart.
  function mergeCorroboration(points) {
    const parent = points.map((_, i) => i);
    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function union(i, j) {
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[ri] = rj;
    }

    for (let i = 0; i < points.length; i++) {
      if (points[i].lat == null || points[i].lng == null) continue;
      if (ageMinutes(points[i].updated) > STALE_WARN_MIN) continue;
      for (let j = i + 1; j < points.length; j++) {
        if (points[j].lat == null || points[j].lng == null) continue;
        if (ageMinutes(points[j].updated) > STALE_WARN_MIN) continue;
        const dist = distanceMeters(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
        if (dist <= MERGE_DISTANCE_M) union(i, j);
      }
    }

    const clusters = new Map();
    points.forEach((p, i) => {
      const root = find(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(p);
    });

    return [...clusters.values()].map((group) => {
      if (group.length === 1) return { ...group[0], contributors: [group[0]] };
      const worst = group.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
      const newest = group.reduce((a, b) => (ageMinutes(b.updated) < ageMinutes(a.updated) ? b : a));
      // A same-rank contributor's photo must survive the merge even when
      // `worst` (picked by status alone) isn't the one that has it — the
      // gray/photo cue in app.js checks the merged point's own photoUrl, not
      // per-contributor, so dropping it here silently hides real evidence.
      const photoUrl = group.map((p) => p.photoUrl).find((u) => u) || null;
      return {
        ...worst,
        key: group.map((p) => p.key).join("+"),
        updated: newest.updated,
        source: [...new Set(group.map((p) => p.source))].join(", "),
        photoUrl,
        contributors: group,
      };
    });
  }

  // Sorts by distance (reusing the same haversine helper mergeCorroboration
  // uses) and returns the closest `limit` stations — see CONTEXT.md "Related
  // condition" for why this never affects Passability status or route verdicts.
  function nearestStations(stations, lat, lng, limit) {
    return stations
      .map((s) => ({ station: s, dist: distanceMeters(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit)
      .map((s) => s.station);
  }

  globalTarget.FloodData = {
    REFRESH_MS,
    BMA_STALE_MS,
    LONGDO_FALLBACK_MS,
    TRAFFY_FALLBACK_MS,
    STALE_WARN_MIN,
    THRESH_YELLOW,
    THRESH_RED,
    STATUS_RANK,
    STATUS_LABEL_TH,
    STATUS_BADGE,
    classify,
    capCitizenSeverity,
    mergeCorroboration,
    distanceMeters,
    parseDepthCm,
    ageMinutes,
    timeAgoTh,
    loadBMA,
    loadLongdo,
    loadTraffy,
    parseCanalStations,
    loadThaiWaterCanal,
    nearestStations,
  };
})();
