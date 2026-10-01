// Data & Freshness page controller — renders live per-source status cards using the
// same window.FloodData fetchers the map page uses.

const FD = window.FloodData;
const I18n = window.I18n;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function minMaxAge(items) {
  let newest = null;
  let oldest = null;
  for (const item of items) {
    const age = FD.ageMinutes(item.updated);
    if (age === Infinity) continue;
    if (newest === null || age < newest) newest = age;
    if (oldest === null || age > oldest) oldest = age;
  }
  return { newest, oldest };
}

function summarize(points) {
  const counts = { red: 0, yellow: 0, green: 0, gray: 0 };
  for (const p of points) counts[p.status]++;
  const { newest, oldest } = minMaxAge(points);
  return { counts, newest, oldest };
}

function fmtAge(mins) {
  return I18n.fmtDuration(mins);
}

function renderCard(name, ok, meta, points, extraRows) {
  const s = ok ? summarize(points) : null;
  return `
    <div class="source-card ${ok ? "" : "error"}">
      <div class="source-card-head">
        <span class="source-name">${escapeHtml(name)}</span>
        <span class="badge ${ok ? "green" : "red"}">${ok ? "ONLINE" : I18n.t("sources.badge.offline")}</span>
      </div>
      ${
        ok
          ? `
      <div class="source-stats">
        <div><span class="stat-num">${points.length}</span><span class="stat-label">${I18n.t("sources.stat.activepoints")}</span></div>
        <div><span class="stat-num">${fmtAge(s.newest)}</span><span class="stat-label">${I18n.t("sources.stat.latest")}</span></div>
      </div>
      <div class="source-breakdown">
        <span class="badge red">${s.counts.red}</span>
        <span class="badge yellow">${s.counts.yellow}</span>
        <span class="badge green">${s.counts.green}</span>
        <span class="badge gray">${s.counts.gray}</span>
      </div>
      ${extraRows || ""}
      `
          : `<p class="empty-hint">${I18n.t("sources.card.error")}</p>`
      }
    </div>`;
}

function renderStationCard(name, ok, stations, extraRows) {
  const { newest, oldest } = ok ? minMaxAge(stations) : { newest: null, oldest: null };
  return `
    <div class="source-card ${ok ? "" : "error"}">
      <div class="source-card-head">
        <span class="source-name">${escapeHtml(name)}</span>
        <span class="badge ${ok ? "green" : "red"}">${ok ? "ONLINE" : I18n.t("sources.badge.offline")}</span>
      </div>
      ${
        ok
          ? `
      <div class="source-stats">
        <div><span class="stat-num">${stations.length}</span><span class="stat-label">${I18n.t("sources.stat.stations")}</span></div>
        <div><span class="stat-num">${fmtAge(newest)}</span><span class="stat-label">${I18n.t("sources.stat.latestvalue")}</span></div>
        <div><span class="stat-num">${fmtAge(oldest)}</span><span class="stat-label">${I18n.t("sources.stat.oldestvalue")}</span></div>
      </div>
      ${extraRows || ""}
      `
          : `<p class="empty-hint">${I18n.t("sources.card.error")}</p>`
      }
    </div>`;
}

// The last-fetched Promise.allSettled results, kept so a language toggle can
// re-render the same data in the new language (renderFromLastFetch) without
// re-hitting the four live feeds — some unofficial/undocumented (see
// docs/adr/0001, docs/adr/0004) — on every toggle click.
let lastFetch = null;

function renderFromLastFetch() {
  if (!lastFetch) return;
  const { bmaRes, longdoRes, traffyRes, thaiwaterRes } = lastFetch;
  const el = document.getElementById("source-cards");
  const statusEl = document.getElementById("last-updated");

  const cards = [];
  if (bmaRes.status === "fulfilled") {
    const { points, sensorCount, notificationCount } = bmaRes.value;
    cards.push(
      renderCard(
        "BMA road water-level sensors",
        true,
        {},
        points,
        `<p class="note">${I18n.t("sources.bma.extra", { sensorCount, notificationCount })}</p>`
      )
    );
  } else {
    cards.push(renderCard("BMA road water-level sensors", false));
  }

  if (longdoRes.status === "fulfilled") {
    const { points, eventCount, floodEventCount } = longdoRes.value;
    cards.push(
      renderCard(
        "Longdo Traffic / iTIC event feed",
        true,
        {},
        points,
        `<p class="note">${I18n.t("sources.longdo.extra", { eventCount, floodEventCount, activeCount: points.length })}</p>`
      )
    );
  } else {
    cards.push(renderCard("Longdo Traffic / iTIC event feed", false));
  }

  if (traffyRes.status === "fulfilled") {
    const { points, ticketCount, floodTicketCount } = traffyRes.value;
    cards.push(
      renderCard(
        I18n.t("sources.traffy.name"),
        true,
        {},
        points,
        `<p class="note">${I18n.t("sources.traffy.extra", { ticketCount, floodTicketCount, activeCount: points.length })}</p>
         <p class="note citizen-note">${I18n.t("sources.traffy.note.html")}</p>`
      )
    );
  } else {
    cards.push(renderCard(I18n.t("sources.traffy.name"), false));
  }

  if (thaiwaterRes.status === "fulfilled") {
    const { stations } = thaiwaterRes.value;
    cards.push(
      renderStationCard(
        I18n.t("sources.thaiwater.name"),
        true,
        stations,
        `<p class="note related-conditions-note">${I18n.t("sources.thaiwater.note")}</p>`
      )
    );
  } else {
    cards.push(renderStationCard(I18n.t("sources.thaiwater.name"), false));
  }

  el.innerHTML = cards.join("");

  const now = I18n.fmtTime(lastFetch.fetchedAt);
  const failed = [bmaRes, longdoRes, traffyRes, thaiwaterRes].some((r) => r.status !== "fulfilled");
  statusEl.textContent = failed ? I18n.t("sources.status.failed", { time: now }) : I18n.t("sources.status.updated", { time: now });
  statusEl.classList.toggle("warning", failed);
}

async function refresh() {
  const statusEl = document.getElementById("last-updated");
  statusEl.textContent = I18n.t("sources.status.updating");

  const [bmaRes, longdoRes, traffyRes, thaiwaterRes] = await Promise.allSettled([
    FD.loadBMA(),
    FD.loadLongdo(),
    FD.loadTraffy(),
    FD.loadThaiWaterCanal(),
  ]);
  lastFetch = { bmaRes, longdoRes, traffyRes, thaiwaterRes, fetchedAt: new Date() };
  renderFromLastFetch();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh-btn").addEventListener("click", refresh);
  document.addEventListener("i18n:change", renderFromLastFetch);
  refresh();
  setInterval(refresh, FD.REFRESH_MS);
});
