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

  const REFRESH_MS = 3 * 60 * 1000; // 3 min, matches BMA sensor refresh cadence
  const BMA_STALE_MS = 3 * 60 * 60 * 1000; // ignore BMA notifications older than 3h
  const LONGDO_FALLBACK_MS = 3 * 60 * 60 * 1000; // if a Longdo report has no "stop", expire after 3h
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

  function classify(depthCm, text) {
    const t = (text || "").toLowerCase();
    if (/ผ่านไม่ได้|impassable|not\s*passable/i.test(t)) return "red";
    if (depthCm != null) {
      if (depthCm > THRESH_RED) return "red";
      if (depthCm >= THRESH_YELLOW) return "yellow";
      return "green";
    }
    if (/เข่า|knee|สูง|shin/i.test(t)) return "yellow";
    return "gray";
  }

  // A Citizen report (Traffy Fondue) is a single unverified submission, so it
  // can never independently produce a "blocked" verdict — see CONTEXT.md.
  function capCitizenSeverity(status) {
    return status === "red" ? "yellow" : status;
  }

  function ageMinutes(iso) {
    if (!iso) return Infinity;
    return (Date.now() - new Date(iso).getTime()) / 60000;
  }

  function timeAgoTh(iso) {
    if (!iso) return "ไม่ทราบเวลา";
    const mins = Math.round(ageMinutes(iso));
    if (mins < 1) return "เมื่อสักครู่";
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    const hrs = Math.round(mins / 60);
    return `${hrs} ชม.ที่แล้ว`;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
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
        status: classify(depthCm, text),
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

      const stopMs = e.stop ? new Date(e.stop.replace(" ", "T")).getTime() : null;
      const startMs = e.start ? new Date(e.start.replace(" ", "T")).getTime() : null;
      const expired = stopMs ? stopMs < now : startMs ? now - startMs > LONGDO_FALLBACK_MS : false;
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
        photoUrl: props.photo_url || null,
      });
    }

    return { points, ticketCount: features.length, floodTicketCount };
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
      return {
        ...worst,
        key: group.map((p) => p.key).join("+"),
        updated: newest.updated,
        source: [...new Set(group.map((p) => p.source))].join(", "),
        contributors: group,
      };
    });
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
    parseDepthCm,
    ageMinutes,
    timeAgoTh,
    loadBMA,
    loadLongdo,
    loadTraffy,
  };
})();
