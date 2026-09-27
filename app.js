// BKK Road Flood 2026 — client-side data fetch, classification, map + route picker.
// No backend, no API keys, no cached/mock data. If a feed fails, we say so — we never
// fabricate a reading.

const BMA_API = "https://floodbangkok.bangkok.go.th/bkk/dds/services/api/floods/v1/items/";
const LONGDO_EVENTS = "https://event.longdo.com/feed/json";

// The Longdo/iTIC feed is nationwide (it includes reports from other provinces, e.g.
// Chon Buri) — this app is Bangkok-scoped, so we filter to a generous Bangkok
// metropolitan bounding box. BMA's own feed is Bangkok-only already, no filter needed.
const BKK_BBOX = { latMin: 13.49, latMax: 13.95, lngMin: 100.33, lngMax: 100.93 };
function inBangkok(lat, lng) {
  return lat >= BKK_BBOX.latMin && lat <= BKK_BBOX.latMax && lng >= BKK_BBOX.lngMin && lng <= BKK_BBOX.lngMax;
}

const REFRESH_MS = 3 * 60 * 1000; // 3 min, matches BMA sensor refresh cadence
const BMA_STALE_MS = 3 * 60 * 60 * 1000; // ignore BMA notifications older than 3h
const LONGDO_FALLBACK_MS = 3 * 60 * 60 * 1000; // if a Longdo report has no "stop", expire after 3h

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

let map, markersLayer;
let allPoints = []; // flattened list of {key,label,sublabel,status,depthCm,updated,source,lat,lng,text}
let selectedKeys = new Set();
let lastFetchOk = { bma: false, longdo: false };

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([13.7563, 100.5018], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
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

function timeAgoTh(iso) {
  if (!iso) return "ไม่ทราบเวลา";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
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

  // Latest active notification per sensor_profile id.
  const latestBySensor = new Map();
  for (const n of notifRes.data || []) {
    const sid = n.sensor_profile;
    if (latestBySensor.has(sid)) continue; // already sorted desc by id (most recent first)
    latestBySensor.set(sid, n);
  }

  const points = [];
  for (const [sid, profile] of profiles) {
    const notif = latestBySensor.get(sid);
    let depthCm = null;
    let status = "gray";
    let updated = null;
    let text = "";
    let active = false;

    if (notif) {
      const ts = notif.start_flood || notif.date_created;
      const age = ts ? Date.now() - new Date(ts).getTime() : Infinity;
      active = !notif.end_flood && age < BMA_STALE_MS;
      if (active) {
        depthCm = parseFloat(notif.value);
        text = notif.text;
        updated = ts;
        status = classify(depthCm, text);
      }
    }
    if (!active) continue; // only surface points with a currently-active report

    points.push({
      key: `bma-${sid}`,
      label: profile.road || profile.name,
      sublabel: `${profile.name} · ${profile.district || ""}`,
      status,
      depthCm,
      updated,
      source: "BMA",
      lat: profile.lat,
      lng: profile.long,
      text,
    });
  }
  return points;
}

async function loadLongdo() {
  const events = await fetchJSON(LONGDO_EVENTS);
  const now = Date.now();
  const points = [];
  for (const e of events) {
    if (e.icon !== "flood") continue;
    const lat = parseFloat(e.latitude);
    const lng = parseFloat(e.longitude);
    if (isNaN(lat) || isNaN(lng) || !inBangkok(lat, lng)) continue;
    const stopMs = e.stop ? new Date(e.stop.replace(" ", "T")).getTime() : null;
    const startMs = e.start ? new Date(e.start.replace(" ", "T")).getTime() : null;
    const expired = stopMs
      ? stopMs < now
      : startMs
      ? now - startMs > LONGDO_FALLBACK_MS
      : false;
    if (expired) continue;

    const text = `${e.title_en || e.title || ""} — ${e.description_en || e.description || ""}`;
    const depthCm = parseDepthCm(text);
    const status = classify(depthCm, text);

    points.push({
      key: `longdo-${e.eid}`,
      label: e.title_en || e.title,
      sublabel: e.description_en || e.description || "",
      status,
      depthCm,
      updated: e.start ? e.start.replace(" ", "T") : null,
      source: `Longdo/iTIC${e.contributor ? " · " + e.contributor : ""}`,
      lat,
      lng,
      text,
    });
  }
  return points;
}

function statusDotHtml(status) {
  return `<span class="dot ${status}"></span>`;
}

function renderMarkers() {
  markersLayer.clearLayers();
  for (const p of allPoints) {
    if (p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) continue;
    const color = { red: "#d63b3b", yellow: "#e8a712", green: "#22a55c", gray: "#9aa1a8" }[p.status];
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 7,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 1.5,
    });
    const depthTxt = p.depthCm != null ? `${p.depthCm} ซม.` : "ไม่ทราบระดับน้ำ";
    marker.bindPopup(`
      <b>${escapeHtml(p.label)}</b>
      ${escapeHtml(p.sublabel || "")}<br/>
      สถานะ: <b>${STATUS_LABEL_TH[p.status]}</b> (${depthTxt})<br/>
      แหล่งข้อมูล: ${escapeHtml(p.source)} · ${timeAgoTh(p.updated)}
      <br/><button class="popup-add-btn" data-key="${p.key}">+ เพิ่มเข้าเส้นทาง</button>
    `);
    marker.on("popupopen", (ev) => {
      const btn = ev.popup.getElement().querySelector(".popup-add-btn");
      if (btn) btn.addEventListener("click", () => toggleSelect(p.key));
    });
    markersLayer.addLayer(marker);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderRoadList(filterText) {
  const listEl = document.getElementById("road-list");
  const q = (filterText || "").trim().toLowerCase();
  const sorted = [...allPoints].sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  const filtered = q ? sorted.filter((p) => p.label.toLowerCase().includes(q)) : sorted;

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-hint">${
      allPoints.length === 0 ? "ยังไม่มีรายงานน้ำท่วมที่ยัง active อยู่ในขณะนี้" : "ไม่พบถนนที่ตรงกับคำค้นหา"
    }</p>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (p) => `
      <div class="road-item ${selectedKeys.has(p.key) ? "selected" : ""}" data-key="${p.key}">
        ${statusDotHtml(p.status)}
        <span class="name">${escapeHtml(p.label)}</span>
        <span class="depth">${p.depthCm != null ? p.depthCm + " ซม." : "?"}</span>
      </div>`
    )
    .join("");

  listEl.querySelectorAll(".road-item").forEach((el) => {
    el.addEventListener("click", () => toggleSelect(el.dataset.key));
  });
}

function toggleSelect(key) {
  if (selectedKeys.has(key)) selectedKeys.delete(key);
  else selectedKeys.add(key);
  renderRoadList(document.getElementById("road-search").value);
  renderRoute();
}

function renderRoute() {
  const routeListEl = document.getElementById("route-list");
  const verdictEl = document.getElementById("route-verdict");
  const selected = allPoints.filter((p) => selectedKeys.has(p.key));

  if (selected.length === 0) {
    routeListEl.innerHTML = `<p class="empty-hint">ยังไม่ได้เลือกถนน — คลิกจากรายการด้านล่าง หรือคลิกหมุดบนแผนที่</p>`;
    verdictEl.classList.add("hidden");
    return;
  }

  routeListEl.innerHTML = selected
    .map(
      (p) => `
      <div class="route-item">
        ${statusDotHtml(p.status)}
        <span class="name">${escapeHtml(p.label)}</span>
        <span class="depth">${p.depthCm != null ? p.depthCm + " ซม." : "?"}</span>
        <button class="remove-btn" data-key="${p.key}" title="เอาออก">✕</button>
      </div>`
    )
    .join("");

  routeListEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleSelect(btn.dataset.key));
  });

  const worst = selected.reduce((a, b) => (STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a));
  verdictEl.classList.remove("hidden", "ok", "caution", "blocked");
  if (worst.status === "red") {
    verdictEl.classList.add("blocked");
    verdictEl.textContent = `🚫 ผ่านไม่ได้ — "${worst.label}" มีรายงานน้ำท่วมสูง แนะนำเลี่ยงเส้นทางนี้`;
  } else if (worst.status === "yellow" || worst.status === "gray") {
    verdictEl.classList.add("caution");
    verdictEl.textContent =
      worst.status === "yellow"
        ? `⚠️ ผ่านได้แต่ระวัง — "${worst.label}" มีน้ำท่วม ${worst.depthCm ?? "?"} ซม.`
        : `⚠️ ไม่ทราบระดับน้ำแน่ชัดที่ "${worst.label}" — โปรดระวัง`;
  } else {
    verdictEl.classList.add("ok");
    verdictEl.textContent = `✅ ผ่านได้ — ไม่มีรายงานน้ำท่วมสูงตามเส้นทางที่เลือก`;
  }
}

function setStatusLine(text) {
  document.getElementById("last-updated").textContent = text;
}

async function refreshAll() {
  setStatusLine("กำลังอัปเดตข้อมูล…");
  const results = await Promise.allSettled([loadBMA(), loadLongdo()]);

  const [bmaRes, longdoRes] = results;
  lastFetchOk.bma = bmaRes.status === "fulfilled";
  lastFetchOk.longdo = longdoRes.status === "fulfilled";

  allPoints = [
    ...(lastFetchOk.bma ? bmaRes.value : []),
    ...(lastFetchOk.longdo ? longdoRes.value : []),
  ];

  renderMarkers();
  renderRoadList(document.getElementById("road-search").value);
  renderRoute();

  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const failures = [];
  if (!lastFetchOk.bma) failures.push("BMA");
  if (!lastFetchOk.longdo) failures.push("Longdo/iTIC");

  if (failures.length === 0) {
    setStatusLine(`อัปเดตล่าสุด ${now} · ${allPoints.length} จุดที่มีรายงานน้ำท่วม`);
  } else {
    setStatusLine(`อัปเดต ${now} — ⚠️ โหลดข้อมูลจาก ${failures.join(", ")} ไม่สำเร็จ (แสดงเฉพาะข้อมูลที่โหลดได้)`);
  }
}

function main() {
  initMap();
  document.getElementById("road-search").addEventListener("input", (e) => renderRoadList(e.target.value));
  document.getElementById("refresh-btn").addEventListener("click", refreshAll);
  refreshAll();
  setInterval(refreshAll, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", main);
