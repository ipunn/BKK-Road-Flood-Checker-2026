// Data & Freshness page controller — renders live per-source status cards using the
// same window.FloodData fetchers the map page uses.

const FD = window.FloodData;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function summarize(points) {
  const counts = { red: 0, yellow: 0, green: 0, gray: 0 };
  let newest = null;
  let oldest = null;
  for (const p of points) {
    counts[p.status]++;
    const age = FD.ageMinutes(p.updated);
    if (age === Infinity) continue;
    if (newest === null || age < newest) newest = age;
    if (oldest === null || age > oldest) oldest = age;
  }
  return { counts, newest, oldest };
}

function fmtAge(mins) {
  if (mins == null) return "—";
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${Math.round(mins)} นาที`;
  return `${(mins / 60).toFixed(1)} ชม.`;
}

function renderCard(name, ok, meta, points, extraRows) {
  const s = ok ? summarize(points) : null;
  return `
    <div class="source-card ${ok ? "" : "error"}">
      <div class="source-card-head">
        <span class="source-name">${escapeHtml(name)}</span>
        <span class="badge ${ok ? "green" : "red"}">${ok ? "ONLINE" : "โหลดไม่สำเร็จ"}</span>
      </div>
      ${
        ok
          ? `
      <div class="source-stats">
        <div><span class="stat-num">${points.length}</span><span class="stat-label">จุด active</span></div>
        <div><span class="stat-num">${fmtAge(s.newest)}</span><span class="stat-label">รายงานล่าสุด</span></div>
        <div><span class="stat-num">${fmtAge(s.oldest)}</span><span class="stat-label">รายงานเก่าสุดที่ยัง active</span></div>
      </div>
      <div class="source-breakdown">
        <span class="badge red">${s.counts.red}</span>
        <span class="badge yellow">${s.counts.yellow}</span>
        <span class="badge green">${s.counts.green}</span>
        <span class="badge gray">${s.counts.gray}</span>
      </div>
      ${extraRows || ""}
      `
          : `<p class="empty-hint">ไม่สามารถโหลดข้อมูลจากแหล่งนี้ได้ในขณะนี้ — ลองรีเฟรชอีกครั้ง</p>`
      }
    </div>`;
}

async function refresh() {
  const el = document.getElementById("source-cards");
  const statusEl = document.getElementById("last-updated");
  statusEl.textContent = "กำลังอัปเดตข้อมูล…";

  const [bmaRes, longdoRes] = await Promise.allSettled([FD.loadBMA(), FD.loadLongdo()]);

  const cards = [];
  if (bmaRes.status === "fulfilled") {
    const { points, sensorCount, notificationCount } = bmaRes.value;
    cards.push(
      renderCard(
        "BMA road water-level sensors",
        true,
        {},
        points,
        `<p class="note">เซ็นเซอร์ทั้งหมด ${sensorCount} จุด &middot; ดึงรายงานล่าสุด ${notificationCount} รายการต่อรอบ</p>`
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
        `<p class="note">เหตุการณ์ทั้งหมดในฟีด ${eventCount} รายการ &middot; ประเภทน้ำท่วม ${floodEventCount} รายการ (ทั้งประเทศ) &middot; ในเขตกรุงเทพฯ ที่ยัง active ${points.length} รายการ</p>`
      )
    );
  } else {
    cards.push(renderCard("Longdo Traffic / iTIC event feed", false));
  }

  el.innerHTML = cards.join("");

  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const failed = [bmaRes, longdoRes].some((r) => r.status !== "fulfilled");
  statusEl.textContent = failed ? `อัปเดต ${now} — มีแหล่งข้อมูลโหลดไม่สำเร็จ` : `อัปเดตล่าสุด ${now}`;
  statusEl.classList.toggle("warning", failed);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh-btn").addEventListener("click", refresh);
  refresh();
  setInterval(refresh, FD.REFRESH_MS);
});
