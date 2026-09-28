// Data & Freshness page controller — renders live per-source status cards using the
// same window.FloodData fetchers the map page uses.

const FD = window.FloodData;

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

function renderStationCard(name, ok, stations, extraRows) {
  const { newest, oldest } = ok ? minMaxAge(stations) : { newest: null, oldest: null };
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
        <div><span class="stat-num">${stations.length}</span><span class="stat-label">สถานี</span></div>
        <div><span class="stat-num">${fmtAge(newest)}</span><span class="stat-label">ค่าล่าสุด</span></div>
        <div><span class="stat-num">${fmtAge(oldest)}</span><span class="stat-label">ค่าเก่าสุด</span></div>
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

  const [bmaRes, longdoRes, traffyRes, thaiwaterRes] = await Promise.allSettled([
    FD.loadBMA(),
    FD.loadLongdo(),
    FD.loadTraffy(),
    FD.loadThaiWaterCanal(),
  ]);

  const cards = [];
  if (bmaRes.status === "fulfilled") {
    const { points, sensorCount, notificationCount } = bmaRes.value;
    cards.push(
      renderCard(
        "BMA road water-level sensors",
        true,
        {},
        points,
        `<p class="note">เซ็นเซอร์ ${sensorCount} จุด &middot; ${notificationCount} รายงานต่อรอบ</p>`
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
        `<p class="note">ฟีด ${eventCount} รายการ &middot; น้ำท่วม ${floodEventCount} รายการ (ทั้งประเทศ) &middot; active ในกรุงเทพฯ ${points.length} รายการ</p>`
      )
    );
  } else {
    cards.push(renderCard("Longdo Traffic / iTIC event feed", false));
  }

  if (traffyRes.status === "fulfilled") {
    const { points, ticketCount, floodTicketCount } = traffyRes.value;
    cards.push(
      renderCard(
        "Traffy Fondue (รายงานจากประชาชน)",
        true,
        {},
        points,
        `<p class="note">ตั๋วในฟีด ${ticketCount} รายการ &middot; น้ำท่วม ${floodTicketCount} รายการ &middot; active ${points.length} รายการ</p>
         <p class="note citizen-note">Endpoint ไม่เป็นทางการ อาจเปลี่ยนแปลงได้ — จำกัดสถานะสูงสุดที่ "ระวัง" เพราะยังไม่ยืนยันโดยเซ็นเซอร์</p>`
      )
    );
  } else {
    cards.push(renderCard("Traffy Fondue (รายงานจากประชาชน)", false));
  }

  if (thaiwaterRes.status === "fulfilled") {
    const { stations } = thaiwaterRes.value;
    cards.push(
      renderStationCard(
        "ThaiWater ระดับน้ำคลอง",
        true,
        stations,
        `<p class="note related-conditions-note">ใช้ public fallback API key ของ ThaiWater ไม่ใช่ key ที่ลงทะเบียนของเราเอง อาจหยุดทำงานได้หาก ThaiWater เปลี่ยนหรือยกเลิก key นี้</p>`
      )
    );
  } else {
    cards.push(renderStationCard("ThaiWater ระดับน้ำคลอง", false));
  }

  el.innerHTML = cards.join("");

  const now = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const failed = [bmaRes, longdoRes, traffyRes, thaiwaterRes].some((r) => r.status !== "fulfilled");
  statusEl.textContent = failed ? `อัปเดต ${now} — มีแหล่งข้อมูลโหลดไม่สำเร็จ` : `อัปเดตล่าสุด ${now}`;
  statusEl.classList.toggle("warning", failed);
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refresh-btn").addEventListener("click", refresh);
  refresh();
  setInterval(refresh, FD.REFRESH_MS);
});
