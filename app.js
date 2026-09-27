// BKK Road Flood 2026 — map page controller.
// Data fetching/classification lives in data.js (window.FloodData); this file only
// renders the map, sidebar, route picker, and freshness filter.

const FD = window.FloodData;

let map, markersLayer, camerasLayer;
let markersByKey = new Map();
let allPoints = []; // every currently-active point, before the freshness filter
let selectedKeys = new Set();
let maxAgeMinutes = 60; // freshness filter — only show points reported within this window
let lastFetchOk = { bma: false, longdo: false, traffy: false };

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([13.7563, 100.5018], 11);
  // Standard OSM raster tiles, light basemap — always free, no API key.
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  camerasLayer = L.layerGroup(); // not added to map — off by default, see CONTEXT.md "Camera pin"
}

// Camera pins are a static snapshot (docs/adr/0002), fetched once — not part
// of the live refresh cycle the three report sources use. They carry no
// Passability status, aren't affected by the freshness filter, aren't
// merged, and can't be added to a route (see CONTEXT.md "Camera pin").
async function loadCameraPins() {
  let cameras;
  try {
    const res = await fetch("cameras.json");
    cameras = await res.json();
  } catch (err) {
    console.error("Failed to load cameras.json", err);
    return false; // caller must be able to retry, not treat this as permanently loaded
  }
  for (const cam of cameras) {
    if (cam.lat == null || cam.lng == null || isNaN(cam.lat) || isNaN(cam.lng)) continue;
    const marker = L.circleMarker([cam.lat, cam.lng], {
      radius: 5,
      color: "#ffffff",
      weight: 1.5,
      fillColor: "#b8863b", // matches --brass in style.css; Leaflet's SVG renderer sets this as a raw attribute, not via CSS, so var() won't resolve here
      fillOpacity: 0.9,
    });
    marker.bindPopup(`
      <b>${escapeHtml(cam.label)}</b>
      ${escapeHtml(cam.sublabel || "")}<br/>
      <span class="citizen-note">เปิดวิดีโอสดของกล้อง CCTV กทม. — ลิงก์นี้เปิดหน้าแรกของระบบ BMA Traffic ทั่วไป ไม่ได้เลือกกล้องตัวนี้โดยตรง (ระบบของ กทม. ยังไม่รองรับลิงก์ตรงถึงกล้องแต่ละตัว)</span><br/>
      <a href="https://cpudapp.bangkok.go.th/bmatraffic/" target="_blank" rel="noopener noreferrer">เปิดวิดีโอสด BMA Traffic ↗</a>
    `);
    camerasLayer.addLayer(marker);
  }
  return true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function statusDotHtml(status, citizen) {
  return `<span class="dot ${status}${citizen ? " citizen" : ""}"></span>`;
}

function visiblePoints() {
  return allPoints.filter((p) => FD.ageMinutes(p.updated) <= maxAgeMinutes);
}

function flyToPoint(key) {
  const p = allPoints.find((x) => x.key === key);
  if (!p || p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) return;
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  const marker = markersByKey.get(key);
  if (marker) marker.openPopup();
}

// Bright, saturated solid colors — legible at a glance on the light basemap.
const MARKER_COLOR = { red: "#e02f2f", yellow: "#f2a10d", green: "#1fA24a", gray: "#8a8a8a" };

// True only when EVERY contributor is a Traffy Fondue Citizen report — i.e.
// nothing here is corroborated by a Sensor report or Event report. A citizen
// report merged with a BMA/Longdo point (mergeCorroboration) IS confirmed by
// that other source, so it must not show the "unconfirmed" treatment.
// See CONTEXT.md "Citizen report" / "Corroboration".
function isCitizenOnly(p) {
  const contributors = p.contributors || [p];
  return contributors.every((c) => c.source === "Traffy Fondue");
}

// Citizen report photo: a small clickable thumbnail opening the full-size
// image in a new tab. See CONTEXT.md "Citizen report" — shown under the same
// "unofficial, best-effort" framing as the rest of the Citizen report data,
// no separate moderation caveat.
function photoThumbHtml(url) {
  // photoUrl is externally-submitted (Traffy citizen report data), so only
  // http(s) is allowed as an href — rejects javascript:/data: URIs that
  // would otherwise execute on click despite escapeHtml (which only escapes
  // markup metacharacters, not URI schemes).
  if (!url || !/^https?:\/\//i.test(url)) return "";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="report-photo-link"><img class="report-photo-thumb" src="${escapeHtml(url)}" alt="รูปถ่ายจากผู้รายงาน" loading="lazy"/></a>`;
}

function contributorsHtml(p) {
  const contributors = p.contributors || [p];
  if (contributors.length <= 1) return "";
  const rows = contributors
    .map((c) => {
      const depthTxt = c.depthCm != null ? `${c.depthCm} ซม.` : "?";
      return `<li>${escapeHtml(c.source)} &middot; ${FD.timeAgoTh(c.updated)} &middot; ${depthTxt}${photoThumbHtml(c.photoUrl)}</li>`;
    })
    .join("");
  return `<div class="corroboration-note">ยืนยันจาก ${contributors.length} รายงาน:<ul>${rows}</ul></div>`;
}

function renderMarkers() {
  markersLayer.clearLayers();
  markersByKey.clear();
  for (const p of visiblePoints()) {
    if (p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) continue;
    // Plain color-coded circle marker, no number on the map itself — depth
    // detail lives in the popup on tap, so the map stays glanceable.
    // A dashed ring marks a citizen-only/citizen-contributed report as not
    // sensor-confirmed — a separate dimension from the status color itself.
    const color = MARKER_COLOR[p.status];
    const citizen = isCitizenOnly(p);
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95,
      dashArray: citizen ? "3 3" : null,
    });
    const depthTxt = p.depthCm != null ? `${p.depthCm} ซม.` : "ไม่ทราบระดับน้ำ";
    const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
    // maxWidth widened from Leaflet's 300px default so the (larger) report
    // photo thumbnail has room without the popup feeling cramped.
    marker.bindPopup(
      `
      <b>${escapeHtml(p.label)}</b>
      ${escapeHtml(p.sublabel || "")}<br/>
      สถานะ: <b>${FD.STATUS_LABEL_TH[p.status]}</b> (${depthTxt})<br/>
      แหล่งข้อมูล: ${escapeHtml(p.source)} &middot; ${FD.timeAgoTh(p.updated)}${stale ? " &middot; <span class=\"stale-tag\">ข้อมูลเก่า</span>" : ""}
      ${citizen ? '<p class="citizen-note">รายงานจากประชาชน (Traffy Fondue) — ไม่ยืนยันโดยเซ็นเซอร์</p>' : ""}
      ${(p.contributors || [p]).length <= 1 ? photoThumbHtml(p.photoUrl) : ""}
      ${contributorsHtml(p)}
      <br/><button class="popup-add-btn" data-key="${p.key}">เพิ่มเข้าเส้นทาง</button>
    `,
      { maxWidth: 340 }
    );
    marker.on("popupopen", (ev) => {
      const btn = ev.popup.getElement().querySelector(".popup-add-btn");
      if (btn) btn.addEventListener("click", () => toggleSelect(p.key));
    });
    markersLayer.addLayer(marker);
    markersByKey.set(p.key, marker);
  }
}

function renderRoadList(filterText) {
  const listEl = document.getElementById("road-list");
  const q = (filterText || "").trim().toLowerCase();
  const sorted = [...visiblePoints()].sort((a, b) => FD.STATUS_RANK[b.status] - FD.STATUS_RANK[a.status]);
  const filtered = q ? sorted.filter((p) => p.label.toLowerCase().includes(q)) : sorted;

  if (filtered.length === 0) {
    listEl.innerHTML = `<p class="empty-hint">${
      allPoints.length === 0
        ? "ไม่มีรายงานน้ำท่วมที่ยัง active อยู่ในขณะนี้"
        : q
        ? "ไม่พบถนนที่ตรงกับคำค้นหา"
        : "ไม่มีรายงานภายในช่วงเวลาที่เลือก — ลองขยายตัวกรองความสดใหม่"
    }</p>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((p) => {
      const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
      return `
      <div class="road-item ${selectedKeys.has(p.key) ? "selected" : ""}" data-key="${p.key}">
        <span class="road-item-main" data-key="${p.key}" title="คลิกเพื่อไปยังตำแหน่งบนแผนที่">
          ${statusDotHtml(p.status, isCitizenOnly(p))}
          <span class="name">${escapeHtml(p.label)}</span>
        </span>
        <span class="depth">${p.depthCm != null ? p.depthCm + " ซม." : "?"}</span>
        <span class="age ${stale ? "stale" : ""}">${FD.timeAgoTh(p.updated)}</span>
        <button class="add-btn" data-key="${p.key}" title="เพิ่ม/เอาออกจากเส้นทาง">${
          selectedKeys.has(p.key) ? "−" : "+"
        }</button>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".road-item-main").forEach((el) => {
    el.addEventListener("click", () => flyToPoint(el.dataset.key));
  });
  listEl.querySelectorAll(".add-btn").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleSelect(el.dataset.key);
    });
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
    routeListEl.innerHTML = `<p class="empty-hint">ยังไม่ได้เลือกถนน — คลิก "+" จากรายการด้านล่าง หรือคลิกหมุดบนแผนที่</p>`;
    verdictEl.classList.add("hidden");
    return;
  }

  routeListEl.innerHTML = selected
    .map((p) => {
      const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
      return `
      <div class="route-item">
        <span class="route-item-main" data-key="${p.key}" title="คลิกเพื่อไปยังตำแหน่งบนแผนที่">
          ${statusDotHtml(p.status, isCitizenOnly(p))}
          <span class="name">${escapeHtml(p.label)}</span>
          <span class="depth">${p.depthCm != null ? p.depthCm + " ซม." : "?"}</span>
          <span class="age ${stale ? "stale" : ""}">${FD.timeAgoTh(p.updated)}</span>
        </span>
        <button class="remove-btn" data-key="${p.key}" title="เอาออก">&times;</button>
      </div>`;
    })
    .join("");

  routeListEl.querySelectorAll(".route-item-main").forEach((el) => {
    el.addEventListener("click", () => flyToPoint(el.dataset.key));
  });
  routeListEl.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleSelect(btn.dataset.key);
    });
  });

  const worst = selected.reduce((a, b) => (FD.STATUS_RANK[b.status] > FD.STATUS_RANK[a.status] ? b : a));
  verdictEl.classList.remove("hidden", "ok", "caution", "blocked");
  const badge = `<span class="badge ${worst.status}">${FD.STATUS_BADGE[worst.status]}</span>`;
  if (worst.status === "red") {
    verdictEl.classList.add("blocked");
    verdictEl.innerHTML = `${badge} ผ่านไม่ได้ — "${escapeHtml(worst.label)}" มีรายงานน้ำท่วมสูง แนะนำเลี่ยงเส้นทางนี้`;
  } else if (worst.status === "yellow" || worst.status === "gray") {
    verdictEl.classList.add("caution");
    verdictEl.innerHTML =
      worst.status === "yellow"
        ? `${badge} ผ่านได้แต่ระวัง — "${escapeHtml(worst.label)}" มีน้ำท่วม ${worst.depthCm ?? "?"} ซม.`
        : `${badge} ไม่ทราบระดับน้ำแน่ชัดที่ "${escapeHtml(worst.label)}" — โปรดระวัง`;
  } else {
    verdictEl.classList.add("ok");
    verdictEl.innerHTML = `${badge} ผ่านได้ — ไม่มีรายงานน้ำท่วมสูงตามเส้นทางที่เลือก`;
  }
}

function setStatusLine(text, isWarning) {
  const el = document.getElementById("last-updated");
  el.textContent = text;
  el.classList.toggle("warning", !!isWarning);
}

async function refreshAll() {
  setStatusLine("กำลังอัปเดตข้อมูล…", false);
  const results = await Promise.allSettled([FD.loadBMA(), FD.loadLongdo(), FD.loadTraffy()]);

  const [bmaRes, longdoRes, traffyRes] = results;
  lastFetchOk.bma = bmaRes.status === "fulfilled";
  lastFetchOk.longdo = longdoRes.status === "fulfilled";
  lastFetchOk.traffy = traffyRes.status === "fulfilled";

  const rawPoints = [
    ...(lastFetchOk.bma ? bmaRes.value.points : []),
    ...(lastFetchOk.longdo ? longdoRes.value.points : []),
    ...(lastFetchOk.traffy ? traffyRes.value.points : []),
  ];
  allPoints = FD.mergeCorroboration(rawPoints);

  renderMarkers();
  renderRoadList(document.getElementById("road-search").value);
  renderRoute();

  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const failures = [];
  if (!lastFetchOk.bma) failures.push("BMA");
  if (!lastFetchOk.longdo) failures.push("Longdo/iTIC");
  if (!lastFetchOk.traffy) failures.push("Traffy Fondue");

  if (failures.length === 0) {
    setStatusLine(`อัปเดตล่าสุด ${now} · ${visiblePoints().length} จุดในช่วงเวลาที่เลือก (ทั้งหมด ${allPoints.length} จุด)`, false);
  } else {
    setStatusLine(`อัปเดต ${now} — โหลดข้อมูลจาก ${failures.join(", ")} ไม่สำเร็จ (แสดงเฉพาะข้อมูลที่โหลดได้)`, true);
  }
}

function main() {
  initMap();
  document.getElementById("road-search").addEventListener("input", (e) => renderRoadList(e.target.value));
  document.getElementById("refresh-btn").addEventListener("click", refreshAll);
  document.getElementById("freshness-filter").addEventListener("change", (e) => {
    maxAgeMinutes = parseInt(e.target.value, 10);
    renderMarkers();
    renderRoadList(document.getElementById("road-search").value);
  });
  const cameraToggle = document.getElementById("camera-toggle");
  let cameraPinsLoaded = false;
  cameraToggle.addEventListener("click", async () => {
    const showing = cameraToggle.getAttribute("aria-pressed") === "true";
    if (!showing && !cameraPinsLoaded) {
      cameraPinsLoaded = await loadCameraPins(); // only true on success — retries on the next click if it failed
    }
    if (showing) {
      map.removeLayer(camerasLayer);
    } else {
      camerasLayer.addTo(map);
    }
    cameraToggle.setAttribute("aria-pressed", String(!showing));
    cameraToggle.classList.toggle("active", !showing);
  });
  refreshAll();
  setInterval(refreshAll, FD.REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", main);
