// BKK Road Flood 2026 — map page controller.
// Data fetching/classification lives in data.js (window.FloodData); this file only
// renders the map, sidebar, route picker, and freshness filter.

const FD = window.FloodData;
const I18n = window.I18n;

let map, markersLayer, camerasLayer, canalMarkersLayer, floodCentreLayer;
let floodCentreItems = []; // BMA flood-centre flooded-roads Related conditions — never a report
let markersByKey = new Map();
let canalMarkersByKey = new Map();
let allPoints = []; // every currently-active point, before the freshness filter
let canalHistory = new Map(); // station key -> previous reading, for trend (FloodData.withCanalTrend)
let canalStations = []; // ThaiWater canal water-level Related conditions — never a report, see CONTEXT.md
const RELATED_CONDITIONS_LIMIT = 5;
let selectedKeys = new Set();
let maxAgeMinutes = 60; // freshness filter — only show points reported within this window
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
  camerasLayer = L.layerGroup(); // not added to map — off by default, see CONTEXT.md "Camera pin"
  floodCentreLayer = L.layerGroup(); // off by default, toggle-loaded like camerasLayer
  canalMarkersLayer = L.layerGroup(); // not added to map — off by default, same pattern as camerasLayer
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
  return L.divIcon({
    className: `canal-wave-icon status-${waterLevelStatus || "neutral"}`,
    html: CANAL_WAVE_SVG,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
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
    // Most of the ~256 stations read "green" (normal) at any given time —
    // showing all of them buries the handful worth a driver's attention
    // under a wall of markers that say "nothing to see here." A green
    // station is still fetched/available (e.g. for a future station-search
    // feature), just not drawn on the map by default.
    if (s.waterLevelStatus === "green") continue;
    const marker = L.marker([s.lat, s.lng], { icon: canalStationIcon(s.waterLevelStatus) });
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
    // A function, not a string: camera pins are loaded once and never
    // re-rendered on a language toggle (unlike the report/canal markers,
    // which are rebuilt from live data every 3 min anyway), so the popup
    // content has to be resolved fresh on each open to pick up the current
    // language instead of baking in whatever was active at load time.
    marker.bindPopup(
      () => `
      <b>${escapeHtml(cam.label)}</b>
      ${escapeHtml(cam.sublabel || "")}<br/>
      <span class="citizen-note">${I18n.t("camera.popup.note")}</span><br/>
      <a href="https://cpudapp.bangkok.go.th/bmatraffic/" target="_blank" rel="noopener noreferrer">${I18n.t("camera.popup.link")}</a>
    `
    );
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

function flyToPoint(key) {
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
  const incomplete = !lastFetchOk.traffy
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
      <br/><button class="popup-add-btn" data-key="${p.key}">${I18n.t("popup.addbtn")}</button>
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
      <div class="road-item ${selectedKeys.has(p.key) ? "selected" : ""}" data-key="${p.key}">
        <span class="road-item-main" data-key="${p.key}" title="${I18n.t("flyto.title")}">
          ${statusDotHtml(p.status, isCitizenOnly(p), hasUnverifiedPhoto(p))}
          <span class="name">${escapeHtml(p.label)}</span>
        </span>
        <span class="depth">${p.depthCm != null ? I18n.fmtDepth(p.depthCm) : "?"}</span>
        <span class="age ${stale ? "stale" : ""}">${I18n.timeAgo(p.updated)}</span>
        <button class="add-btn" data-key="${p.key}" title="${I18n.t("road.addremove.title")}">${
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
    routeListEl.innerHTML = `<p class="empty-hint">${I18n.t("route.list.empty")}</p>`;
    verdictEl.classList.add("hidden");
    return;
  }

  routeListEl.innerHTML = selected
    .map((p) => {
      const stale = FD.ageMinutes(p.updated) > FD.STALE_WARN_MIN;
      return `
      <div class="route-item">
        <span class="route-item-main" data-key="${p.key}" title="${I18n.t("flyto.title")}">
          ${statusDotHtml(p.status, isCitizenOnly(p), hasUnverifiedPhoto(p))}
          <span class="name">${escapeHtml(p.label)}</span>
          <span class="depth">${p.depthCm != null ? I18n.fmtDepth(p.depthCm) : "?"}</span>
          <span class="age ${stale ? "stale" : ""}">${I18n.timeAgo(p.updated)}</span>
        </span>
        <button class="remove-btn" data-key="${p.key}" title="${I18n.t("route.remove.title")}">&times;</button>
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
    verdictEl.innerHTML = `${badge}${I18n.t("verdict.blocked", { road: escapeHtml(worst.label) })}`;
  } else if (worst.status === "yellow" || worst.status === "gray") {
    verdictEl.classList.add("caution");
    verdictEl.innerHTML =
      worst.status === "yellow"
        ? `${badge}${I18n.t("verdict.caution", { road: escapeHtml(worst.label), depth: worst.depthCm ?? "?" })}`
        : `${badge}${I18n.t("verdict.unknown", { road: escapeHtml(worst.label) })}`;
  } else {
    verdictEl.classList.add("ok");
    verdictEl.innerHTML = `${badge}${I18n.t("verdict.clear")}`;
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
  const now = I18n.fmtTime(new Date());
  const failures = [];
  if (!lastFetchOk.bma) failures.push("BMA");
  if (!lastFetchOk.longdo) failures.push("Longdo/iTIC");
  if (!lastFetchOk.traffy) failures.push("Traffy Fondue");
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
async function refreshReports() {
  setStatusLine(I18n.t("status.updating"), false);
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
  reportPhotos = [
    ...(lastFetchOk.traffy ? traffyRes.value.photos : []),
    ...(lastFetchOk.longdo ? longdoRes.value.photos : []),
  ];

  renderMarkers();
  renderRoadList(document.getElementById("road-search").value);
  renderRoute();
  renderPhotoGallery();
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

  // Flooded-roads sheet: one-time fetch on first toggle (retries on the next
  // click if it failed), like camera pins. A failure only shows its own note.
  const floodCentreToggle = document.getElementById("floodcentre-toggle");
  const floodCentreStatus = document.getElementById("floodcentre-status");
  floodCentreToggle.addEventListener("click", async () => {
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

  // The map/road-list/route/status-line strings above are all generated by
  // this file (not swept by I18n.applyTranslations's data-i18n scan), so a
  // language toggle needs its own re-render pass to pick up the new language.
  document.addEventListener("i18n:change", () => {
    renderMarkers();
    renderRoadList(document.getElementById("road-search").value);
    renderRoute();
    renderPhotoGallery();
    renderRelatedConditions();
    renderCanalMarkers();
    renderFloodCentreMarkers();
    updateStatusLine();
  });

  refreshAll();
  setInterval(refreshAll, FD.REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", main);
