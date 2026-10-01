// BKK Road Flood 2026 — map page controller.
// Data fetching/classification lives in data.js (window.FloodData); this file only
// renders the map, sidebar, and freshness filter.

const FD = window.FloodData;
const I18n = window.I18n;

let map, markersLayer, canalMarkersLayer, floodCentreLayer, gistdaLayer;
let floodCentreItems = []; // BMA flood-centre flooded-roads Related conditions — never a report
let markersByKey = new Map();
let canalMarkersByKey = new Map();
let allPoints = []; // every currently-active point, before the freshness filter
let canalHistory = new Map(); // station key -> previous reading, for trend (FloodData.withCanalTrend)
let canalStations = []; // ThaiWater canal water-level Related conditions — never a report, see CONTEXT.md
const RELATED_CONDITIONS_LIMIT = 5;
let maxAgeMinutes = 180; // freshness filter — only show points reported within this window
let reportPhotos = []; // Traffy Report photo candidates for the "Latest photos" gallery — independent of the freshness filter
const GALLERY_PAGE = 12;
const COUNTS_WINDOW_H = 6;
const COUNTS_SHOWN = 8;
let galleryShown = GALLERY_PAGE;
let galleryArea = { district: "", query: "" }; // Area flood view filter; both optional, cleared = full gallery
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
  floodCentreLayer = L.layerGroup(); // off by default, fetched on first show
  canalMarkersLayer = L.layerGroup(); // shown by default; the chip toggles it
}

// A wave glyph (never the plain circleMarker dot road/camera points use) so a
// canal station can't be mistaken for a Passability-status or camera marker
// at a glance. Its background color reflects `waterLevelStatus` (data.js) —
// derived from real, BMA-sourced thresholds — falling back to this neutral
// blue when no threshold is known for a station (CANAL_STATION_THRESHOLDS
// doesn't cover every station, and never guesses a direction for the small
// number of stations whose thresholds run backwards). See CONTEXT.md
// "Water-level status" and docs/adr/0005-canal-water-level-status.md for why
// this supersedes the earlier single-color-only decision.
// Sized to match the road-status marker footprint (circleMarker radius 5-8,
// i.e. ~10-16px diameter) rather than dominate it — 256 canal stations
// heavily outnumber the handful of road reports typically on screen, so
// keeping the icon small is what keeps Passability status the primary
// visual layer. See CONTEXT.md "Water-level status".
const CANAL_WAVE_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14">' +
  '<circle class="canal-wave-bg" cx="12" cy="12" r="10"/>' +
  '<path class="canal-wave-glyph" d="M4 13c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0"/>' +
  "</svg>";

function canalStationIcon(waterLevelStatus) {
  // Normal (green) stations are drawn smaller and faded (CSS) so the few at
  // warning/critical stay the eye-catchers among ~256 stations.
  const n = waterLevelStatus === "green" ? 9 : 14;
  return L.divIcon({
    className: `canal-wave-icon status-${waterLevelStatus || "neutral"}`,
    html: CANAL_WAVE_SVG,
    iconSize: [n, n],
    iconAnchor: [n / 2, n / 2],
  });
}

// Canal stations are a Related condition, not a report (CONTEXT.md) — no
// Passability status, not merged, not selectable into a route, same as
// camera pins. Rebuilt on every ThaiWater refresh so the layer (whether
// currently shown or not) always reflects the latest fetch.
const CANAL_TREND_GLYPH = { rising: "▲", falling: "▼", steady: "●" };

// Trend + margin-to-critical lines shared by the popup and sidebar row.
// Both are omitted (not guessed) when the data to compute them is missing.
function canalDetailHtml(s) {
  const parts = [];
  if (s.trend) {
    const prev = s.trend !== "steady" ? " " + I18n.t("canal.trend.prev", { n: s.prevLevelM.toFixed(2) }) : "";
    parts.push(I18n.t("canal.trend." + s.trend) + prev);
  }
  if (s.marginToCriticalM != null) {
    const key = s.marginToCriticalM >= 0 ? "canal.margin.under" : "canal.margin.over";
    parts.push(I18n.t(key, { n: Math.abs(s.marginToCriticalM).toFixed(2) }));
  }
  return parts.length ? `<br/><span class="canal-detail">${parts.join(" &middot; ")}</span>` : "";
}

// Diamond glyph — distinct from road dots (circles) and canal wave icons.
// A Related condition (CONTEXT.md): no Passability status, no verdict input,
// never merged. The sheet has no per-row timestamp, so every popup says so.
function renderFloodCentreMarkers() {
  floodCentreLayer.clearLayers();
  for (const it of floodCentreItems) {
    const marker = L.marker([it.lat, it.lng], {
      icon: L.divIcon({ className: "floodcentre-icon", html: "<span></span>", iconSize: [16, 16] }),
    });
    marker.bindPopup(`
      <b>${escapeHtml(it.road)}</b><br/>
      ${escapeHtml(it.segment)}<br/>
      ${it.note ? escapeHtml(it.note) + "<br/>" : ""}
      <span class="related-conditions-note">${I18n.t("floodcentre.source")} &middot; ${I18n.t("floodcentre.unknowntime")} &middot; ${I18n.t("floodcentre.approx")}</span><br/>
      <span class="related-conditions-note">${I18n.t("floodcentre.note")}</span>
    `);
    floodCentreLayer.addLayer(marker);
  }
}

function renderCanalMarkers() {
  canalMarkersLayer.clearLayers();
  canalMarkersByKey.clear();
  for (const s of canalStations) {
    if (s.lat == null || s.lng == null || isNaN(s.lat) || isNaN(s.lng)) continue;
    const marker = L.marker([s.lat, s.lng], {
      icon: canalStationIcon(s.waterLevelStatus),
      zIndexOffset: s.waterLevelStatus === "green" ? -500 : 0, // normal stations never cover a warning one
    });
    marker.bindPopup(`
      <b>${escapeHtml(s.label)}</b><br/>
      ${I18n.fmtMeters(s.levelM.toFixed(2))} &middot; ${I18n.timeAgo(s.updated)}${canalDetailHtml(s)}<br/>
      <span class="related-conditions-note">${I18n.t("canal.popup.note")}</span>
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
  collapseSheet();
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
    (hasPhoto ? `<span class="photo-cue" title="${I18n.t("photo.cue.title")}">📷</span>` : "")
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
      ? I18n.t("canal.status.loading")
      : lastFetchOk.thaiwater
      ? I18n.t("canal.status.none")
      : I18n.t("canal.status.error");
    el.innerHTML = `<p class="empty-hint">${msg}</p>`;
    return;
  }
  const { lat, lng } = getReferenceLatLng();
  const nearest = FD.nearestStations(canalStations, lat, lng, RELATED_CONDITIONS_LIMIT);
  el.innerHTML = nearest
    .map(
      (s) => `
      <div class="station-item" data-key="${s.key}" title="${I18n.t("flyto.title")}">
        <span class="name">${escapeHtml(s.label)}</span>
        <span class="level">${I18n.fmtMeters(s.levelM.toFixed(2))}</span>
        <span class="age">${I18n.timeAgo(s.updated)}</span>
        ${s.trend ? `<span class="trend trend-${s.trend}" title="${I18n.t("canal.trend." + s.trend)}">${CANAL_TREND_GLYPH[s.trend]}</span>` : ""}
      </div>`
    )
    .join("");
  el.querySelectorAll(".station-item").forEach((row) => {
    row.addEventListener("click", () => flyToCanalStation(row.dataset.key));
  });
}

// On a phone the bottom sheet covers the map once expanded; collapse it
// whenever the user picks something to look at on the map. No-op on desktop.
function collapseSheet() {
  const t = document.getElementById("sidebar-toggle");
  if (t) t.setAttribute("aria-expanded", "false");
}

function flyToPoint(key) {
  collapseSheet();
  const p = allPoints.find((x) => x.key === key);
  if (!p || p.lat == null || p.lng == null || isNaN(p.lat) || isNaN(p.lng)) return;
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  const marker = markersByKey.get(key);
  if (marker) marker.openPopup();
}

// "Latest photos" gallery. Deliberately ignores maxAgeMinutes (ADR-0007): a
// photo is labelled by its age, never filtered by the verdict window, and it
// never changes Passability status.
function renderPhotoGallery() {
  const el = document.getElementById("photo-gallery");
  const moreBtn = document.getElementById("photo-gallery-more");
  const { items, hasMore, emptyReason } = FD.buildPhotoGallery(reportPhotos, Date.now(), galleryShown, 0, galleryArea);
  const incomplete = reportSettled.traffy && !lastFetchOk.traffy
    ? `<p class="empty-hint">${I18n.t("gallery.incomplete")}</p>`
    : "";
  if (!items.length) {
    el.innerHTML =
      incomplete ||
      `<p class="empty-hint">${I18n.t(emptyReason ? "gallery.empty." + emptyReason : "gallery.empty")}</p>`;
  } else {
    el.innerHTML = incomplete + items
      .map((it) => {
        const url = /^https?:\/\//i.test(it.photoUrl) ? it.photoUrl : "";
        return `<button type="button" class="gallery-item" data-key="${escapeHtml(it.key)}">
          <img src="${escapeHtml(url)}" alt="${I18n.t("report.photo.alt")}" loading="lazy"/>
          <span class="gallery-age">${I18n.timeAgo(it.updated)}</span>
          <span class="gallery-place">${escapeHtml(it.place)}</span>
          <span class="gallery-source">${escapeHtml(it.source)}</span>
        </button>`;
      })
      .join("");
    el.querySelectorAll(".gallery-item").forEach((btn) => {
      btn.addEventListener("click", () => flyToGalleryItem(btn.dataset.key));
    });
  }
  moreBtn.hidden = !hasMore;
  renderDistrictCounts();
  renderPeekPhotos();
}

// Mobile: the latest photos sit in the always-visible peek strip, so the key
// feature needs zero taps. Tapping one flies to it; "See all" opens the sheet
// at the full gallery. Hidden by CSS on desktop, where the gallery is already
// in view in the sidebar.
const PEEK_PHOTOS = 8;
function renderPeekPhotos() {
  const el = document.getElementById("peek-photos");
  if (!el) return;
  const { items } = FD.buildPhotoGallery(reportPhotos, Date.now(), PEEK_PHOTOS, 0, { district: "", query: "" });
  el.classList.toggle("empty", items.length === 0);
  el.setAttribute("aria-label", I18n.t("gallery.title"));
  if (!items.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML =
    items
      .map((it) => {
        const url = /^https?:\/\//i.test(it.photoUrl) ? it.photoUrl : "";
        return `<button type="button" class="peek-photo" data-key="${escapeHtml(it.key)}">
          <img src="${escapeHtml(url)}" alt="${I18n.t("report.photo.alt")}" decoding="async"/>
          <span class="peek-age">${I18n.timeAgo(it.updated)}</span>
        </button>`;
      })
      .join("") + `<button type="button" class="peek-all">${I18n.t("peek.photos.all")} &rsaquo;</button>`;
  el.querySelectorAll(".peek-photo").forEach((b) => b.addEventListener("click", () => flyToGalleryItem(b.dataset.key)));
  el.querySelector(".peek-all").addEventListener("click", () => {
    document.getElementById("sidebar-toggle").setAttribute("aria-expanded", "true");
    const panel = document.getElementById("photo-gallery-panel");
    document.getElementById("sidebar-panels").scrollTop = panel.offsetTop - 12;
  });
}

// Report counts per district (reports, never a flood level). Choosing one
// opens that area in the gallery.
function renderDistrictCounts() {
  const wrap = document.getElementById("district-counts");
  const top = FD.countReportsByDistrict(reportPhotos, Date.now(), COUNTS_WINDOW_H * 3600000)
    .filter((c) => c.count > 0)
    .slice(0, COUNTS_SHOWN);
  wrap.hidden = top.length === 0;
  if (!top.length) return;
  document.getElementById("district-counts-title").textContent = I18n.t("gallery.counts.title", { hours: COUNTS_WINDOW_H });
  const list = document.getElementById("district-counts-list");
  list.innerHTML = top
    .map(
      (c) =>
        `<button type="button" class="district-count-chip${c.district === galleryArea.district ? " active" : ""}" data-district="${escapeHtml(c.district)}">${I18n.t("gallery.counts.item", { district: escapeHtml(c.district), n: c.count })}</button>`
    )
    .join("");
  list.querySelectorAll(".district-count-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("gallery-district").value = btn.dataset.district;
      galleryArea = { district: btn.dataset.district, query: document.getElementById("gallery-search").value };
      galleryShown = GALLERY_PAGE;
      renderPhotoGallery();
    });
  });
}

// Pans to the report; opens its marker popup when it has one, else (older
// than the verdict window, so no marker) a plain popup with the photo.
function flyToGalleryItem(key) {
  collapseSheet();
  const it = reportPhotos.find((p) => p.key === key);
  if (!it) return;
  map.flyTo([it.lat, it.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  // A corroborated marker's key joins its contributors' keys with "+".
  const markerKey = [...markersByKey.keys()].find((k) => k.split("+").includes(key));
  if (markerKey) {
    markersByKey.get(markerKey).openPopup();
    return;
  }
  L.popup()
    .setLatLng([it.lat, it.lng])
    .setContent(`<strong>${escapeHtml(it.place)}</strong><br>${escapeHtml(it.source)} &middot; ${I18n.timeAgo(it.updated)}${photoThumbHtml(it.photoUrl)}`)
    .openOn(map);
}

// Bright, saturated solid colors — legible at a glance on the light basemap.
const MARKER_COLOR = { red: "#e02f2f", yellow: "#f2a10d", green: "#1fA24a", gray: "#8a8a8a" };
// Reuses the sidebar legend's own translated labels for a report's status
// line, rather than a second, separately-translated copy of the same words.
const STATUS_LEGEND_KEY = { red: "legend.blocked", yellow: "legend.caution", green: "legend.clear", gray: "legend.unknown" };

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
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="report-photo-link"><img class="report-photo-thumb" src="${escapeHtml(url)}" alt="${I18n.t("report.photo.alt")}" loading="lazy"/></a>`;
}

function contributorsHtml(p) {
  const contributors = p.contributors || [p];
  if (contributors.length <= 1) return "";
  const rows = contributors
    .map((c) => {
      const depthTxt = c.depthCm != null ? I18n.fmtDepth(c.depthCm) : "?";
      return `<li>${escapeHtml(c.source)} &middot; ${I18n.timeAgo(c.updated)} &middot; ${depthTxt}${photoThumbHtml(c.photoUrl)}</li>`;
    })
    .join("");
  return `<div class="corroboration-note">${I18n.t("corroboration.note", { n: contributors.length })}<ul>${rows}</ul></div>`;
}

// Answer-first summary. With no userLocation it counts every visible report
// in Bangkok; after an explicit "Use my location" tap it counts reports within
// NEARME_RADIUS_M of the driver. The location lives only in this variable —
// never stored or sent (docs/adr/0009).
const NEARME_RADIUS_M = 2000;
let userLocation = null; // {lat, lng} or null
let userMarker = null;

function fmtDist(m) {
  return m < 1000 ? I18n.t("summary.dist.m", { n: Math.round(m) }) : I18n.t("summary.dist.km", { n: (m / 1000).toFixed(1) });
}

function renderSummary() {
  const pts = visiblePoints();
  const s = FD.summarizePoints(pts, userLocation ? { origin: userLocation, radiusM: NEARME_RADIUS_M } : undefined);
  const tiles = [
    ["red", "summary.blocked", s.red],
    ["yellow", "summary.caution", s.yellow],
    ["green", "summary.clear", s.green],
  ];
  document.getElementById("summary-stats").innerHTML = tiles
    .map(([c, k, n]) => `<div class="stat ${c}${n === 0 ? " zero" : ""}"><span class="stat-n">${n}</span><span class="stat-l">${I18n.t(k)}</span></div>`)
    .join("");
  document.getElementById("summary-peek").innerHTML =
    `<span class="peek-stats">${tiles.map(([c, k, n]) => `<span class="peek-stat ${c}${n === 0 ? " zero" : ""}"><b>${n}</b> ${I18n.t(k)}</span>`).join("")}</span>`;
  const age = I18n.t("freshness." + maxAgeMinutes);
  const scope = userLocation
    ? I18n.t("summary.scope.near", { km: NEARME_RADIUS_M / 1000, age })
    : I18n.t("summary.scope.city", { age });
  document.getElementById("summary-scope").textContent = scope;
  document.getElementById("summary-peek").insertAdjacentHTML("beforeend", `<span class="peek-scope">${scope}</span>`);
  const nearestEl = document.getElementById("summary-nearest");
  nearestEl.hidden = !userLocation;
  nearestEl.replaceChildren();
  if (userLocation) {
    if (s.nearestBlocked) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link-btn";
      b.textContent = I18n.t("summary.nearest", { name: s.nearestBlocked.point.label, dist: fmtDist(s.nearestBlocked.distM) });
      b.addEventListener("click", () => flyToPoint(s.nearestBlocked.point.key));
      nearestEl.appendChild(b);
    } else {
      nearestEl.textContent = I18n.t("summary.nearest.none");
    }
  } else if (s.red + s.yellow + s.green + s.gray === 0 && allPoints.length > 0) {
    // Everything is older than the freshness window — say so rather than a row of zeros.
    document.getElementById("summary-scope").textContent = scope + " — " + I18n.t("summary.empty");
  }
  document.getElementById("nearme-btn").textContent = I18n.t(userLocation ? "nearme.off" : "nearme.btn");
}

function setNearMeMessage(key) {
  const el = document.getElementById("nearme-msg");
  el.textContent = key ? I18n.t(key) : "";
  el.hidden = !key;
}

function clearUserLocation() {
  userLocation = null;
  if (userMarker) {
    map.removeLayer(userMarker);
    userMarker = null;
  }
  setNearMeMessage(null);
  renderSummary();
}

function requestUserLocation() {
  if (!navigator.geolocation) return setNearMeMessage("nearme.error");
  setNearMeMessage("nearme.finding");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (!FD.isInBangkok(lat, lng)) return setNearMeMessage("nearme.outside");
      userLocation = { lat, lng };
      userMarker = L.circleMarker([lat, lng], { radius: 7, color: "#ffffff", weight: 2, fillColor: "#b8863b", fillOpacity: 1, interactive: false }).addTo(map);
      map.setView([lat, lng], 14);
      setNearMeMessage("nearme.privacy");
      renderSummary();
    },
    (err) => setNearMeMessage(err && err.code === 1 ? "nearme.denied" : "nearme.error"),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

const CAMERA_SVG =
  '<svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"><path fill="#fff" d="M9 4 7.2 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.2L15 4H9zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';

function photoPinIcon(color, citizen, unknown) {
  const n = unknown ? 15 : 18;
  return L.divIcon({
    className: "photo-pin",
    html: `<span class="photo-pin-disc${citizen ? " citizen" : ""}${unknown ? " unknown" : ""}" style="background:${color}">${CAMERA_SVG}</span>`,
    iconSize: [n, n],
    iconAnchor: [n / 2, n / 2],
  });
}

function renderMarkers() {
  renderSummary();
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
    // A report that carries a photo gets a camera-glyph pin (same status colour,
    // same dashed ring for citizen-only) so "there's a photo to look at" reads
    // on the map without opening the popup.
    const marker = p.photoUrl
      ? L.marker([p.lat, p.lng], { icon: photoPinIcon(color, citizen, unknown) })
      : L.circleMarker([p.lat, p.lng], {
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
        ? I18n.fmtDepth(p.depthCm)
        : hasUnverifiedPhoto(p)
        ? I18n.t("roadlist.hasphoto")
        : I18n.t("legend.unknown");
    const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
    // maxWidth widened from Leaflet's 300px default so the (larger) report
    // photo thumbnail has room without the popup feeling cramped.
    marker.bindPopup(
      `
      <b>${escapeHtml(p.label)}</b>
      ${escapeHtml(p.sublabel || "")}<br/>
      ${I18n.t("popup.status.label")} <b>${I18n.t(STATUS_LEGEND_KEY[p.status])}</b> (${depthTxt})<br/>
      ${I18n.t("popup.source.label")} ${escapeHtml(p.source)} &middot; ${I18n.timeAgo(p.updated)}${stale ? ` &middot; <span class="stale-tag">${I18n.t("legend.stale")}</span>` : ""}
      ${citizen ? `<p class="citizen-note">${I18n.t("citizen.note")}</p>` : ""}
      ${(p.contributors || [p]).length <= 1 ? photoThumbHtml(p.photoUrl) : ""}
      ${contributorsHtml(p)}
    `,
      { maxWidth: 340 }
    );
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
        ? I18n.t("roadlist.empty.none")
        : q
        ? I18n.t("roadlist.empty.nomatch")
        : I18n.t("roadlist.empty.filtered")
    }</p>`;
    return;
  }

  listEl.innerHTML = filtered
    .map((p) => {
      const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
      return `
      <div class="road-item" data-key="${p.key}">
        <span class="road-item-main" data-key="${p.key}" title="${I18n.t("flyto.title")}">
          ${statusDotHtml(p.status, isCitizenOnly(p), hasUnverifiedPhoto(p))}
          <span class="name">${escapeHtml(p.label)}</span>
        </span>
        <span class="depth">${p.depthCm != null ? I18n.fmtDepth(p.depthCm) : "?"}</span>
        <span class="age ${stale ? "stale" : ""}">${I18n.timeAgo(p.updated)}</span>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll(".road-item-main").forEach((el) => {
    el.addEventListener("click", () => flyToPoint(el.dataset.key));
  });
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
  const now = I18n.fmtTime(new Date());
  const failures = [];
  if (reportSettled.bma && !lastFetchOk.bma) failures.push("BMA");
  if (reportSettled.longdo && !lastFetchOk.longdo) failures.push("Longdo/iTIC");
  if (reportSettled.traffy && !lastFetchOk.traffy) failures.push("Traffy Fondue");
  if (thaiwaterEverSettled && !lastFetchOk.thaiwater) failures.push("ThaiWater");

  if (failures.length === 0) {
    setStatusLine(I18n.t("status.updated", { time: now, visible: visiblePoints().length, total: allPoints.length }), false);
  } else {
    setStatusLine(I18n.t("status.failed", { time: now, sources: failures.join(", ") }), true);
  }
}

// The three actual road-report sources — merged and rendered to the
// map/road-list/route as soon as they're all in. Gates the loading overlay:
// see thaiwaterEverSettled's comment for why ThaiWater is deliberately not
// one of these three.
// Each report source renders the moment it arrives (a slow one no longer holds
// up the others or the loading overlay). Last good data per source is kept, so
// a refresh in flight never blanks the map.
const reportData = { bma: null, longdo: null, traffy: null };
const reportSettled = { bma: false, longdo: false, traffy: false };

function applyReports() {
  allPoints = FD.mergeCorroboration([
    ...(reportData.bma ? reportData.bma.points : []),
    ...(reportData.longdo ? reportData.longdo.points : []),
    ...(reportData.traffy ? reportData.traffy.points : []),
  ]);
  reportPhotos = [
    ...(reportData.traffy ? reportData.traffy.photos : []),
    ...(reportData.longdo ? reportData.longdo.photos : []),
  ];
  renderMarkers();
  renderRoadList(document.getElementById("road-search").value);
  renderPhotoGallery();
  hideLoadingOverlay(); // no-op after the first successful cycle — see its own comment
  updateStatusLine();
}

function refreshReports() {
  setStatusLine(I18n.t("status.updating"), false);
  const loaders = { bma: FD.loadBMA, longdo: FD.loadLongdo, traffy: FD.loadTraffy };
  for (const [name, load] of Object.entries(loaders)) {
    load().then(
      (value) => {
        reportData[name] = value;
        lastFetchOk[name] = true;
      },
      (err) => {
        console.error(`Failed to load ${name}`, err);
        lastFetchOk[name] = false;
        reportData[name] = null;
      }
    ).then(() => {
      reportSettled[name] = true;
      applyReports();
    });
  }
}

// ThaiWater's Related-conditions panel — fetched on its own cadence,
// independent of the report sources above, so its latency never delays first
// map paint. See thaiwaterEverSettled's comment.
async function refreshThaiWater() {
  const [thaiwaterRes] = await Promise.allSettled([FD.loadThaiWaterCanal()]);
  lastFetchOk.thaiwater = thaiwaterRes.status === "fulfilled";
  thaiwaterEverSettled = true;
  if (lastFetchOk.thaiwater) {
    const withTrend = FD.withCanalTrend(thaiwaterRes.value.stations, canalHistory);
    canalStations = withTrend.stations;
    canalHistory = withTrend.history;
  } else {
    canalStations = [];
  }

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
  // District picker + place search turn the gallery into the Area flood view.
  // No device location is used — the area is always chosen by the user.
  const districtSel = document.getElementById("gallery-district");
  FD.BANGKOK_DISTRICTS.forEach((d) => {
    const o = document.createElement("option");
    o.value = d;
    o.textContent = d; // district names stay source-language
    districtSel.appendChild(o);
  });
  const onAreaChange = () => {
    galleryArea = { district: districtSel.value, query: document.getElementById("gallery-search").value };
    galleryShown = GALLERY_PAGE;
    renderPhotoGallery();
  };
  districtSel.addEventListener("change", onAreaChange);
  document.getElementById("gallery-search").addEventListener("input", onAreaChange);
  document.getElementById("photo-gallery-more").addEventListener("click", () => {
    galleryShown += GALLERY_PAGE;
    renderPhotoGallery();
  });
  document.getElementById("refresh-btn").addEventListener("click", refreshAll);
  document.getElementById("nearme-btn").addEventListener("click", () => {
    if (userLocation) clearUserLocation();
    else requestUserLocation();
  });
  document.getElementById("freshness-filter").addEventListener("change", (e) => {
    maxAgeMinutes = parseInt(e.target.value, 10);
    renderMarkers();
    renderRoadList(document.getElementById("road-search").value);
  });
  // The collapsed sheet's height varies (photo strip present/absent), so size
  // the map's bottom margin from it instead of a hardcoded number.
  const fitMapToSheet = () => {
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const t = document.getElementById("sidebar-toggle");
    const p = document.getElementById("peek-photos");
    const wrap = document.getElementById("map-wrap");
    const expanded = t.getAttribute("aria-expanded") === "true";
    wrap.style.marginBottom = mobile && !expanded ? `${t.offsetHeight + (p.offsetHeight || 0)}px` : "";
    map.invalidateSize();
  };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fitMapToSheet);
    ro.observe(document.getElementById("sidebar-toggle"));
    ro.observe(document.getElementById("peek-photos"));
  }
  window.addEventListener("resize", fitMapToSheet);
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const sidebarPanels = document.getElementById("sidebar-panels");
  sidebarToggle.addEventListener("click", () => {
    const expanded = sidebarToggle.getAttribute("aria-expanded") === "true";
    sidebarToggle.setAttribute("aria-expanded", String(!expanded));
    fitMapToSheet();
  });

  // Flooded-roads sheet: one-time fetch on first toggle (retries on the next
  // click if it failed). A failure only shows its own note.
  const floodCentreToggle = document.getElementById("floodcentre-toggle");
  const floodCentreStatus = document.getElementById("floodcentre-status");
  let floodCentreBusy = false; // ignore taps while the first fetch is in flight, so an early "off" tap can't be misread
  floodCentreToggle.addEventListener("click", async () => {
    if (floodCentreBusy) return;
    floodCentreBusy = true;
    try {
      await floodCentreToggleClick();
    } finally {
      floodCentreBusy = false;
    }
  });
  async function floodCentreToggleClick() {
    const showing = floodCentreToggle.getAttribute("aria-pressed") === "true";
    if (!showing && floodCentreItems.length === 0) {
      try {
        floodCentreItems = (await FD.loadFloodCentreSheet()).items;
        floodCentreStatus.hidden = true;
        renderFloodCentreMarkers();
      } catch (err) {
        console.error("Failed to load flood-centre sheet", err);
        floodCentreStatus.textContent = I18n.t("floodcentre.error");
        floodCentreStatus.hidden = false;
        return;
      }
    }
    if (showing) map.removeLayer(floodCentreLayer);
    else floodCentreLayer.addTo(map);
    floodCentreToggle.setAttribute("aria-pressed", String(!showing));
    floodCentreToggle.classList.toggle("active", !showing);
  }

  // GISTDA 24 h warning polygons: vector tiles, so Leaflet.VectorGrid is
  // loaded from the CDN only on first toggle (no build step, no API key).
  // A Related condition (CONTEXT.md) — no Passability status, no verdict input.
  // The legend carries the "update time unknown" label (docs/adr/0008).
  const gistdaToggle = document.getElementById("gistda-toggle");
  const gistdaStatus = document.getElementById("gistda-status");
  const gistdaShowError = () => {
    gistdaStatus.textContent = I18n.t("gistda.error");
    gistdaStatus.hidden = false;
  };
  // No always-on legend: tapping a warning area opens a popup that says what
  // it is (level, source, update time unknown, not a road report).
  const gistdaPopup = (e) => {
    const cls = e.layer && e.layer.properties ? e.layer.properties.class_risk : null;
    const style = FD.gistdaWarnStyle(cls);
    if (!style) return;
    L.popup()
      .setLatLng(e.latlng)
      .setContent(
        `<b>${I18n.t("gistda.popup." + style.label)}</b>` +
          `${I18n.t("gistda.legend")}<br/>` +
          `<span class="related-conditions-note">${I18n.t("gistda.note")}</span>`
      )
      .openOn(map);
  };
  const loadVectorGrid = () =>
    window.L.vectorGrid
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/leaflet.vectorgrid@1.3.0/dist/Leaflet.VectorGrid.bundled.min.js";
          s.crossOrigin = "";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
  let gistdaBusy = false; // guards double-clicks while the script/probe load is in flight
  gistdaToggle.addEventListener("click", async () => {
    if (gistdaBusy) return;
    gistdaBusy = true;
    try {
      await gistdaToggleClick();
    } finally {
      gistdaBusy = false;
    }
  });
  async function gistdaToggleClick() {
    const showing = gistdaToggle.getAttribute("aria-pressed") === "true";
    if (!showing && !gistdaLayer) {
      try {
        await loadVectorGrid();
        if (!(await FD.probeGistdaTiles())) throw new Error("GISTDA tile host unavailable");
        gistdaLayer = L.vectorGrid.protobuf(FD.GISTDA_WARN_TILE_URL, {
          maxNativeZoom: 6, // tiles stop at ~z6; the layer over-zooms like GISTDA's own client
          vectorTileLayerStyles: {
            flood_warn: (props) => FD.gistdaWarnStyle(props.class_risk) || { fill: false, stroke: false },
          },
          interactive: true,
        });
        gistdaLayer.on("click", gistdaPopup);
      } catch (err) {
        console.error("Failed to load GISTDA warning layer", err);
        gistdaStatus.className = "empty-hint";
        gistdaShowError();
        return;
      }
    }
    if (showing) {
      map.removeLayer(gistdaLayer);
      gistdaStatus.hidden = true;
    } else {
      gistdaLayer.addTo(map);
      gistdaStatus.hidden = true;
    }
    gistdaToggle.setAttribute("aria-pressed", String(!showing));
    gistdaToggle.classList.toggle("active", !showing);
  }

  // Canal markers are already kept up to date by refreshThaiWater() on the
  // normal refresh cycle regardless of toggle state (the sidebar's Related
  // conditions panel needs the data either way) — this toggle only controls
  // the map layer's visibility, .
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

  // The map/road-list/route/status-line strings above are all generated by
  // this file (not swept by I18n.applyTranslations's data-i18n scan), so a
  // language toggle needs its own re-render pass to pick up the new language.
  document.addEventListener("i18n:change", () => {
    renderMarkers();
    renderRoadList(document.getElementById("road-search").value);
      renderPhotoGallery();
    renderRelatedConditions();
    renderCanalMarkers();
    renderFloodCentreMarkers();
    updateStatusLine();
  });

  // Every layer is on by default; the chips only switch them off.
  // The canal chip is cheap; the flood-centre fetch and GISTDA's script + tiles
  // wait until the reports have had a head start.
  canalToggle.click();
  setTimeout(() => [floodCentreToggle, gistdaToggle].forEach((t) => t.click()), 2000);

  refreshAll();
  setInterval(refreshAll, FD.REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", main);
