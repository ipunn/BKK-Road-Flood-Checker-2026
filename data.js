// Shared data-fetching, classification, and formatting logic.
// Used by both index.html (map) and sources.html (data & freshness page).
// Exposed as window.FloodData — plain script, no bundler/build step.

(function () {
  const BMA_API = "https://floodbangkok.bangkok.go.th/bkk/dds/services/api/floods/v1/items/";
  const LONGDO_EVENTS = "https://event.longdo.com/feed/json";

  const REFRESH_MS = 3 * 60 * 1000; // 3 min, matches BMA sensor refresh cadence
  const BMA_STALE_MS = 3 * 60 * 60 * 1000; // ignore BMA notifications older than 3h
  const LONGDO_FALLBACK_MS = 3 * 60 * 60 * 1000; // if a Longdo report has no "stop", expire after 3h
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

  window.FloodData = {
    REFRESH_MS,
    BMA_STALE_MS,
    LONGDO_FALLBACK_MS,
    STALE_WARN_MIN,
    THRESH_YELLOW,
    THRESH_RED,
    STATUS_RANK,
    STATUS_LABEL_TH,
    STATUS_BADGE,
    classify,
    parseDepthCm,
    ageMinutes,
    timeAgoTh,
    loadBMA,
    loadLongdo,
  };
})();
