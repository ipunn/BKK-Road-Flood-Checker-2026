// BKK Road Flood 2026 — map page controller.
// Data fetching/classification lives in data.js (window.FloodData); this file only
// renders the map, sidebar, route picker, and freshness filter.

const FD = window.FloodData;

let map, markersLayer, camerasLayer, canalMarkersLayer;
let markersByKey = new Map();
let canalMarkersByKey = new Map();
let allPoints = []; // every currently-active point, before the freshness filter
let canalStations = []; // ThaiWater canal water-level Related conditions — never a report, see CONTEXT.md
const RELATED_CONDITIONS_LIMIT = 5;
let selectedKeys = new Set();
let maxAgeMinutes = 180; // freshness filter — only show points reported within this window
let lastFetchOk = { bma: false, longdo: false, traffy: false, thaiwater: false };
// ThaiWater's canal-level feed measured ~10x slower than Longdo/Traffy and on
// par with or slower than BMA (see .scratch/traffy-fondue-citizen-reports/
// issues/02-decouple-thaiwater-initial-load.md) — since it's a Related
// condition that never affects a road's passability (CONTEXT.md), it's
// fetched independently of the three report sources so its latency can't
// hold up the loading overlay or first map paint. This flag distinguishes
// "hasn't finished its first fetch yet" from "fetched and failed", so the
// panel doesn't flash a false failure message while still loading.
let thaiwaterEverSettled = false;

function initMap() {
  map = L.map("map", { zoomControl: true }).setView([13.7563, 100.5018], 11);
  // Standard OSM raster tiles, light basemap — always free, no API key.
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  camerasLayer = L.layerGroup(); // not added to map — off by default, see CONTEXT.md "Camera pin"
  canalMarkersLayer = L.layerGroup(); // not added to map — off by default, same pattern as camerasLayer
}

// ThaiWater canal stations get a single neutral color, never a red/yellow/
// green/gray Passability color — the feed has no cross-station-comparable
// severity signal (measureValue is relative to each station's own local
// datum, not a shared reference; storagePercent ranges from -402% to +188%
// live, clearly not a clean 0-100% scale), so color-coding by level would
// invent a severity judgment the data can't actually support. See
// .scratch/traffy-fondue-citizen-reports/issues/03-canal-map-markers.md.
const CANAL_MARKER_COLOR = "#4d7a91"; // matches --canal-blue in style.css; Leaflet's SVG renderer sets this as a raw attribute, not via CSS, so var() won't resolve here

// Canal stations are a Related condition, not a report (CONTEXT.md) — no
// Passability status, not merged, not selectable into a route, same as
// camera pins. Rebuilt on every ThaiWater refresh so the layer (whether
// currently shown or not) always reflects the latest fetch.
function renderCanalMarkers() {
  canalMarkersLayer.clearLayers();
  canalMarkersByKey.clear();
  for (const s of canalStations) {
    if (s.lat == null || s.lng == null || isNaN(s.lat) || isNaN(s.lng)) continue;
    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 4,
      color: "#ffffff",
      weight: 1,
      fillColor: CANAL_MARKER_COLOR,
      fillOpacity: 0.85,
    });
    marker.bindPopup(`
      <b>${escapeHtml(s.label)}</b><br/>
      ${s.levelM.toFixed(2)} ม. &middot; ${FD.timeAgoTh(s.updated)}<br/>
      <span class="related-conditions-note">ข้อมูลบริบท ไม่ใช่รายงานสภาพถนน</span>
    `);
    canalMarkersLayer.addLayer(marker);
    canalMarkersByKey.set(s.key, marker);
  }
}

// Clicking a station in the sidebar's Related-conditions list flies to it —
// same UX as flyToPoint() for road-list items. Turns the canal marker layer
// on first if it's currently hidden (toggle off by default), since flying to
// a pin the user can't see would be confusing; keeps #canal-toggle's own
// pressed/active state in sync so the button doesn't lie about layer state.
function flyToCanalStation(key) {
  const s = canalStations.find((x) => x.key === key);
  if (!s || s.lat == null || s.lng == null || isNaN(s.lat) || isNaN(s.lng)) return;
  const canalToggle = document.getElementById("canal-toggle");
  if (canalToggle.getAttribute("aria-pressed") !== "true") {
    canalMarkersLayer.addTo(map);
    canalToggle.setAttribute("aria-pressed", "true");
    canalToggle.classList.add("active");
  }
  map.flyTo([s.lat, s.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  const marker = canalMarkersByKey.get(key);
  if (marker) marker.openPopup();
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
      <span class="citizen-note">ลิงก์เปิดหน้า BMA Traffic ทั่วไป — ไม่ใช่กล้องนี้โดยตรง</span><br/>
      <a href="https://cpudapp.bangkok.go.th/bmatraffic/" target="_blank" rel="noopener noreferrer">ดูกล้อง BMA ↗</a>
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

// hasPhoto: true only for an unmeasured ("gray") report that carries a
// citizen-submitted photo — flags it in the list as "we don't know the
// depth, but you can look at the photo and judge for yourself" rather than
// guessing a severity. See docs/adr/0003.
function statusDotHtml(status, citizen, hasPhoto) {
  return (
    `<span class="dot ${status}${citizen ? " citizen" : ""}"></span>` +
    (hasPhoto ? `<span class="photo-cue" title="มีภาพประกอบ — ดูภาพเพื่อประเมินด้วยตนเอง">📷</span>` : "")
  );
}

function visiblePoints() {
  return allPoints.filter((p) => FD.ageMinutes(p.updated) <= maxAgeMinutes);
}

// The point to measure "nearest" from: the currently searched road's
// location when a search matches a visible report, otherwise the map's
// current view center. Related conditions are always shown (see CONTEXT.md),
// just re-sorted to whatever's most relevant right now.
// Matches renderRoadList()'s own sort (worst status first) so the canal
// panel centers on the same road the search results actually show on top,
// not just whichever matching point happens to come first in allPoints.
function getReferenceLatLng() {
  const q = (document.getElementById("road-search").value || "").trim().toLowerCase();
  if (q) {
    const sorted = [...visiblePoints()].sort(
      (a, b) => FD.STATUS_RANK[b.status] - FD.STATUS_RANK[a.status]
    );
    const match = sorted.find(
      (p) => p.lat != null && p.lng != null && p.label.toLowerCase().includes(q)
    );
    if (match) return { lat: match.lat, lng: match.lng };
  }
  const center = map.getCenter();
  return { lat: center.lat, lng: center.lng };
}

function renderRelatedConditions() {
  const el = document.getElementById("related-conditions-list");
  if (canalStations.length === 0) {
    const msg = !thaiwaterEverSettled
      ? "กำลังโหลดข้อมูลระดับน้ำคลอง…"
      : lastFetchOk.thaiwater
      ? "ไม่มีข้อมูลระดับน้ำคลองขณะนี้"
      : "โหลดข้อมูลระดับน้ำคลองไม่สำเร็จ";
    el.innerHTML = `<p class="empty-hint">${msg}</p>`;
    return;
  }
  const { lat, lng } = getReferenceLatLng();
  const nearest = FD.nearestStations(canalStations, lat, lng, RELATED_CONDITIONS_LIMIT);
  el.innerHTML = nearest
    .map(
      (s) => `
      <div class="station-item" data-key="${s.key}" title="คลิกเพื่อไปยังตำแหน่งบนแผนที่">
        <span class="name">${escapeHtml(s.label)}</span>
        <span class="level">${s.levelM.toFixed(2)} ม.</span>
        <span class="age">${FD.timeAgoTh(s.updated)}</span>
      </div>`
    )
    .join("");
  el.querySelectorAll(".station-item").forEach((row) => {
    row.addEventListener("click", () => flyToCanalStation(row.dataset.key));
  });
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
// Unmeasured ("gray") report with a real photo — the camera-cue condition,
// factored out so the road list and route list can't drift apart on when to
// show it. See docs/adr/0003.
function hasUnverifiedPhoto(p) {
  return p.status === "gray" && !!p.photoUrl;
}

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
    // Gray (unknown) markers are drawn smaller/fainter than a confirmed
    // severity (red/yellow/green) so a map with many unmeasured reports
    // doesn't visually drown out the ones we actually have a verdict for.
    const unknown = p.status === "gray";
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: unknown ? 5 : 8,
      color: "#ffffff",
      // Gray markers get a thicker ring than the weight/radius de-emphasis
      // above would otherwise give them: the ring is the "there's a clickable
      // point here" affordance, a separate concern from the fill's "how
      // confident is this verdict" signal, so it shouldn't shrink alongside
      // the fill on a busy/gray basemap.
      weight: unknown ? 3 : 2,
      fillColor: color,
      fillOpacity: unknown ? 0.65 : 0.95,
      dashArray: citizen ? "3 3" : null,
    });
    // A gray (unmeasured) citizen report with a photo: don't repeat "unknown"
    // in both slots — point at the photo instead, since that's the actual
    // evidence available. See docs/adr/0003.
    const depthTxt =
      p.depthCm != null
        ? `${p.depthCm} ซม.`
        : hasUnverifiedPhoto(p)
        ? "มีภาพประกอบ"
        : "ไม่ทราบระดับน้ำ";
    const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
    // maxWidth widened from Leaflet's 300px default so the (larger) report
    // photo thumbnail has room without the popup feeling cramped.
    marker.bindPopup(
      `
      <b>${escapeHtml(p.label)}</b>
      ${escapeHtml(p.sublabel || "")}<br/>
      สถานะ: <b>${FD.STATUS_LABEL_TH[p.status]}</b> (${depthTxt})<br/>
      แหล่งข้อมูล: ${escapeHtml(p.source)} &middot; ${FD.timeAgoTh(p.updated)}${stale ? " &middot; <span class=\"stale-tag\">ข้อมูลเก่า</span>" : ""}
      ${citizen ? '<p class="citizen-note">รายงานจากประชาชน — ไม่ยืนยันโดยเซ็นเซอร์</p>' : ""}
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
        ? "ไม่มีรายงานน้ำท่วมขณะนี้"
        : q
        ? "ไม่พบถนนที่ค้นหา"
        : "ไม่มีรายงานในช่วงเวลานี้ — ลองขยายตัวกรอง"
    }</p>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((p) => {
      const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
      return `
      <div class="road-item ${selectedKeys.has(p.key) ? "selected" : ""}" data-key="${p.key}">
        <span class="road-item-main" data-key="${p.key}" title="คลิกเพื่อไปยังตำแหน่งบนแผนที่">
          ${statusDotHtml(p.status, isCitizenOnly(p), hasUnverifiedPhoto(p))}
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
          ${statusDotHtml(p.status, isCitizenOnly(p), hasUnverifiedPhoto(p))}
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
    verdictEl.innerHTML = `${badge} ผ่านไม่ได้ — "${escapeHtml(worst.label)}" น้ำท่วมสูง`;
  } else if (worst.status === "yellow" || worst.status === "gray") {
    verdictEl.classList.add("caution");
    verdictEl.innerHTML =
      worst.status === "yellow"
        ? `${badge} ระวัง — "${escapeHtml(worst.label)}" น้ำท่วม ${worst.depthCm ?? "?"} ซม.`
        : `${badge} ไม่ทราบระดับน้ำที่ "${escapeHtml(worst.label)}"`;
  } else {
    verdictEl.classList.add("ok");
    verdictEl.innerHTML = `${badge} ผ่านได้ — ไม่มีรายงานน้ำท่วมรุนแรงในเส้นทางนี้`;
  }
}

function setStatusLine(text, isWarning) {
  const el = document.getElementById("last-updated");
  el.textContent = text;
  el.classList.toggle("warning", !!isWarning);
}

// Shown only until the very first fetch cycle finishes — a first-time
// visitor has no way to tell "still loading" from "broken" otherwise, since
// the map itself is pannable/zoomable before any report data has arrived.
// Never re-shown on the periodic 3-min refresh, so it can't interrupt an
// active session.
let firstLoadDone = false;
function hideLoadingOverlay() {
  if (firstLoadDone) return;
  firstLoadDone = true;
  const overlay = document.getElementById("loading-overlay");
  overlay.classList.add("hidden");
  overlay.addEventListener("transitionend", () => { overlay.hidden = true; }, { once: true });
}

// Composes the single status line from whichever sources have reported in so
// far. Called independently by refreshReports() and refreshThaiWater() since
// they no longer await each other — see thaiwaterEverSettled's comment.
function updateStatusLine() {
  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const failures = [];
  if (!lastFetchOk.bma) failures.push("BMA");
  if (!lastFetchOk.longdo) failures.push("Longdo/iTIC");
  if (!lastFetchOk.traffy) failures.push("Traffy Fondue");
  if (thaiwaterEverSettled && !lastFetchOk.thaiwater) failures.push("ThaiWater");

  if (failures.length === 0) {
    setStatusLine(`อัปเดต ${now} · ${visiblePoints().length}/${allPoints.length} จุด`, false);
  } else {
    setStatusLine(`อัปเดต ${now} — โหลด ${failures.join(", ")} ไม่สำเร็จ`, true);
  }
}

// The three actual road-report sources — merged and rendered to the
// map/road-list/route as soon as they're all in. Gates the loading overlay:
// see thaiwaterEverSettled's comment for why ThaiWater is deliberately not
// one of these three.
async function refreshReports() {
  setStatusLine("กำลังอัปเดต…", false);
  const [bmaRes, longdoRes, traffyRes] = await Promise.allSettled([
    FD.loadBMA(),
    FD.loadLongdo(),
    FD.loadTraffy(),
  ]);

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
  hideLoadingOverlay(); // no-op after the first successful cycle — see its own comment

  updateStatusLine();
}

// ThaiWater's Related-conditions panel — fetched on its own cadence,
// independent of the report sources above, so its latency never delays first
// map paint. See thaiwaterEverSettled's comment.
async function refreshThaiWater() {
  const [thaiwaterRes] = await Promise.allSettled([FD.loadThaiWaterCanal()]);
  lastFetchOk.thaiwater = thaiwaterRes.status === "fulfilled";
  thaiwaterEverSettled = true;
  canalStations = lastFetchOk.thaiwater ? thaiwaterRes.value.stations : [];

  renderRelatedConditions();
  renderCanalMarkers();
  updateStatusLine();
}

function refreshAll() {
  refreshReports();
  refreshThaiWater();
}

function main() {
  initMap();
  map.on("moveend", renderRelatedConditions);
  document.getElementById("road-search").addEventListener("input", (e) => {
    renderRoadList(e.target.value);
    renderRelatedConditions();
  });
  document.getElementById("refresh-btn").addEventListener("click", refreshAll);
  document.getElementById("freshness-filter").addEventListener("change", (e) => {
    maxAgeMinutes = parseInt(e.target.value, 10);
    renderMarkers();
    renderRoadList(document.getElementById("road-search").value);
  });
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarPanels = document.getElementById("sidebar-panels");
  sidebarToggle.addEventListener("click", () => {
    const expanded = sidebarToggle.getAttribute("aria-expanded") === "true";
    sidebarToggle.setAttribute("aria-expanded", String(!expanded));
    // Expanding/collapsing the mobile bottom sheet resizes #map (they share
    // #app's flex-column height) — Leaflet needs invalidateSize() after the
    // CSS transition or its tiles stay clipped to the old container size.
    sidebarPanels.addEventListener(
      "transitionend",
      () => map.invalidateSize(),
      { once: true }
    );
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

  // Canal markers are already kept up to date by refreshThaiWater() on the
  // normal refresh cycle regardless of toggle state (the sidebar's Related
  // conditions panel needs the data either way) — this toggle only controls
  // the map layer's visibility, unlike camera pins which are a one-time
  // fetch triggered by the toggle itself.
  const canalToggle = document.getElementById("canal-toggle");
  canalToggle.addEventListener("click", () => {
    const showing = canalToggle.getAttribute("aria-pressed") === "true";
    if (showing) {
      map.removeLayer(canalMarkersLayer);
    } else {
      canalMarkersLayer.addTo(map);
    }
    canalToggle.setAttribute("aria-pressed", String(!showing));
    canalToggle.classList.toggle("active", !showing);
  });

  refreshAll();
  setInterval(refreshAll, FD.REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", main);
