// EN/TH language toggle — see docs/adr/0006-client-side-language-toggle.md.
// Exposed as window.I18n — plain script, no bundler/build step, same pattern
// as data.js's window.FloodData. Also loadable under Node's test runner.
//
// Road/place names from live feeds are Source-language content (CONTEXT.md)
// and never go through this dictionary — only static, app-authored text does.

(function () {
  const globalTarget = typeof window !== "undefined" ? window : globalThis;
  const STORAGE_KEY = "bkk-flood-lang";

  const DICT = {
    th: {
      "doc.title.index": "BKK Road Flood 2026 — เช็คน้ำท่วมถนนกรุงเทพฯ",
      "doc.title.sources": "แหล่งข้อมูล — BKK Road Flood 2026",
      "doc.title.contact": "ติดต่อ — BKK Road Flood 2026",

      "nav.map": "แผนที่",
      "nav.sources": "แหล่งข้อมูล",
      "nav.contact": "ติดต่อ",

      "status.loading": "กำลังโหลด…",
      "refresh.title": "โหลดข้อมูลใหม่",
      "refresh.label": "รีเฟรช",

      "sidebar.roadlist": "รายการถนน",
      "myroute.title": "เส้นทางของฉัน",
      "myroute.empty": 'ยังไม่ได้เลือกถนน — คลิก "+" หรือคลิกหมุดบนแผนที่',
      "search.title": "ค้นหาถนน",
      "freshness.label": "แสดงข้อมูลไม่เกิน",
      "freshness.15": "15 นาที",
      "freshness.30": "30 นาที",
      "freshness.60": "1 ชั่วโมง",
      "freshness.180": "3 ชั่วโมง (ทั้งหมด)",
      "camera.toggle": "กล้อง CCTV (BMA)",
      "canal.toggle": "ระดับน้ำคลอง (ThaiWater)",
      "road.search.placeholder": "พิมพ์ชื่อถนน เช่น ลาดพร้าว, เอกชัย…",
      "legend.clear": "ผ่านได้",
      "legend.caution": "ผ่านได้แต่ระวัง",
      "legend.blocked": "ผ่านไม่ได้",
      "legend.unknown": "ไม่ทราบระดับน้ำ",
      "legend.stale": "ข้อมูลเก่า",
      "legend.stale.suffix": " = รายงานเกิน 1 ชม.",
      "canal.legend.warning": "เตือนภัย",
      "canal.legend.critical": "วิกฤติ",
      "canal.legend.unknownthreshold": "ไม่ทราบเกณฑ์",
      "canal.legend.note": "(สถานีระดับน้ำปกติไม่แสดงบนแผนที่)",
      "relatedcanal.title": "ระดับน้ำคลองใกล้เคียง",
      "relatedcanal.note": "ข้อมูลบริบท ไม่ใช่รายงานสภาพถนน — ใช้ประกอบการพิจารณาเท่านั้น",
      "disclaimer.notofficial": "ไม่ใช่ช่องทางทางการ",
      "disclaimer.follow": " — ติดตามประกาศจาก",
      "disclaimer.agencies": "กทม., กรมอุตุฯ, ปภ.",
      "disclaimer.hotline": "สายด่วน",
      "disclaimer.sourcedetails": "รายละเอียดแหล่งข้อมูล",

      "flyto.title": "คลิกเพื่อไปยังตำแหน่งบนแผนที่",
      "floodcentre.toggle": "ถนนน้ำท่วม (ศูนย์ป้องกันน้ำท่วม กทม.)",
      "floodcentre.source": "แหล่งข้อมูล: ศูนย์ป้องกันและแก้ไขปัญหาน้ำท่วม กทม.",
      "floodcentre.unknowntime": "ไม่ทราบเวลาอัปเดต",
      "floodcentre.approx": "ตำแหน่งโดยประมาณ",
      "floodcentre.note": "ข้อมูลบริบท ไม่ใช่รายงานสภาพถนน",
      "floodcentre.error": "โหลดรายการถนนน้ำท่วมของ กทม. ไม่สำเร็จ",
      "gistda.toggle": "เตือนภัยน้ำท่วม 24 ชม. (GISTDA)",
      "gistda.legend": "เตือนภัยน้ำท่วม 24 ชม. จาก GISTDA (ระดับพื้นที่ ไม่ทราบเวลาอัปเดต)",
      "gistda.watch": "เฝ้าระวัง",
      "gistda.warning": "เตือนน้ำท่วม",
      "gistda.note": "ข้อมูลบริบท ไม่ใช่รายงานสภาพถนน",
      "gistda.error": "โหลดชั้นเตือนภัยของ GISTDA ไม่สำเร็จ",
      "summary.title": "สถานการณ์ตอนนี้",
      "summary.blocked": "ผ่านไม่ได้",
      "summary.caution": "ระวัง",
      "summary.clear": "ผ่านได้",
      "summary.scope.city": "ทั่วกรุงเทพฯ · รายงานไม่เกิน {age}",
      "summary.scope.near": "ภายใน {km} กม. จากตำแหน่งของคุณ · รายงานไม่เกิน {age}",
      "summary.nearest": "ถนนที่ผ่านไม่ได้ใกล้สุด: {name} ({dist})",
      "summary.nearest.none": "ไม่มีรายงานถนนผ่านไม่ได้ในรัศมีนี้",
      "summary.empty": "ยังไม่มีรายงานในช่วงเวลานี้",
      "summary.dist.m": "{n} ม.",
      "summary.dist.km": "{n} กม.",
      "nearme.btn": "ใช้ตำแหน่งของฉัน",
      "nearme.off": "ดูทั่วกรุงเทพฯ",
      "nearme.finding": "กำลังหาตำแหน่ง…",
      "nearme.denied": "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง",
      "nearme.error": "หาตำแหน่งไม่สำเร็จ",
      "nearme.outside": "ตำแหน่งของคุณอยู่นอกกรุงเทพฯ",
      "nearme.privacy": "ใช้ตำแหน่งในเบราว์เซอร์เท่านั้น ไม่ส่งออกและไม่เก็บไว้",
      "canal.popup.note": "ข้อมูลบริบท ไม่ใช่รายงานสภาพถนน",
      "canal.trend.rising": "▲ ระดับน้ำเพิ่มขึ้น",
      "canal.trend.falling": "▼ ระดับน้ำลดลง",
      "canal.trend.steady": "● ระดับน้ำคงที่",
      "canal.trend.prev": "(ครั้งก่อน {n} ม.)",
      "canal.margin.under": "ต่ำกว่าระดับวิกฤติ {n} ม.",
      "canal.margin.over": "เกินระดับวิกฤติ {n} ม.",
      "camera.popup.note": "ลิงก์เปิดหน้า BMA Traffic ทั่วไป — ไม่ใช่กล้องนี้โดยตรง",
      "camera.popup.link": "ดูกล้อง BMA ↗",
      "photo.cue.title": "มีภาพประกอบ — ดูภาพเพื่อประเมินด้วยตนเอง",
      "canal.status.loading": "กำลังโหลดข้อมูลระดับน้ำคลอง…",
      "canal.status.none": "ไม่มีข้อมูลระดับน้ำคลองขณะนี้",
      "canal.status.error": "โหลดข้อมูลระดับน้ำคลองไม่สำเร็จ",
      "report.photo.alt": "รูปถ่ายจากผู้รายงาน",
      "gallery.title": "รูปล่าสุดจากรายงาน",
      "gallery.note": "รูปจากรายงานประชาชน เรียงจากใหม่ไปเก่า ไม่ใช่สถานะถนน — ดูอายุของรูปทุกครั้ง",
      "gallery.more": "แสดงเพิ่ม",
      "gallery.counts.title": "จำนวนรายงานใน {hours} ชม. ที่ผ่านมา (นับรายงาน ไม่ใช่ระดับน้ำท่วม)",
      "gallery.counts.item": "{district} · {n} รายงาน",
      "gallery.district.label": "เลือกเขต",
      "gallery.district.all": "ทุกเขต",
      "gallery.search.placeholder": "ค้นหาสถานที่ เช่น ซอย ถนน หมู่บ้าน…",
      "gallery.empty.none": "ยังไม่มีรายงานล่าสุดในพื้นที่นี้ (ไม่ได้หมายความว่าไม่มีน้ำท่วม)",
      "gallery.empty.stale": "ข้อมูลที่ใกล้ที่สุดเก่าเกินไปหรืออยู่ไกลเกินกว่าจะบอกได้",
      "gallery.empty": "ไม่มีรูปจากรายงานในขณะนี้",
      "gallery.incomplete": "ไม่สามารถโหลดข้อมูลจาก Traffy Fondue ได้ รายการรูปอาจไม่ครบ",
      "corroboration.note": "ยืนยันจาก {n} รายงาน:",
      "popup.status.label": "สถานะ:",
      "popup.source.label": "แหล่งข้อมูล:",
      "citizen.note": "รายงานจากประชาชน — ไม่ยืนยันโดยเซ็นเซอร์",
      "popup.addbtn": "เพิ่มเข้าเส้นทาง",
      "roadlist.hasphoto": "มีภาพประกอบ",
      "roadlist.empty.none": "ไม่มีรายงานน้ำท่วมขณะนี้",
      "roadlist.empty.nomatch": "ไม่พบถนนที่ค้นหา",
      "roadlist.empty.filtered": "ไม่มีรายงานในช่วงเวลานี้ — ลองขยายตัวกรอง",
      "road.addremove.title": "เพิ่ม/เอาออกจากเส้นทาง",
      "route.list.empty": 'ยังไม่ได้เลือกถนน — คลิก "+" จากรายการด้านล่าง หรือคลิกหมุดบนแผนที่',
      "route.remove.title": "เอาออก",
      "verdict.blocked": ' ผ่านไม่ได้ — "{road}" น้ำท่วมสูง',
      "verdict.caution": ' ระวัง — "{road}" น้ำท่วม {depth} ซม.',
      "verdict.unknown": ' ไม่ทราบระดับน้ำที่ "{road}"',
      "verdict.clear": " ผ่านได้ — ไม่มีรายงานน้ำท่วมรุนแรงในเส้นทางนี้",
      "status.updating": "กำลังอัปเดต…",
      "status.updated": "อัปเดต {time} · {visible}/{total} จุด",
      "status.failed": "อัปเดต {time} — โหลด {sources} ไม่สำเร็จ",
      "unit.depth": "{n} ซม.",
      "unit.meters": "{n} ม.",

      "time.unknown": "ไม่ทราบเวลา",
      "time.now": "เมื่อสักครู่",
      "time.minutesAgo": "{n} นาทีที่แล้ว",
      "time.hoursAgo": "{n} ชม.ที่แล้ว",
      "duration.minutes": "{n} นาที",
      "duration.hours": "{n} ชม.",

      "sources.h.status": "สถานะแหล่งข้อมูลตอนนี้",
      "sources.h.sources": "แหล่งข้อมูล",
      "table.source": "แหล่งข้อมูล",
      "table.provides": "ให้ข้อมูลอะไร",
      "table.updatecycle": "รอบอัปเดต",
      "sources.row.bma.provides": "เซ็นเซอร์วัดระดับน้ำ ~254 จุด ค่าความลึกแบบสด",
      "sources.row.bma.cycle": "~3 นาที",
      "sources.row.longdo.provides": "รายงานจากกรมทางหลวง, สนน. กทม., ผู้ใช้ iTIC (กรองเฉพาะกรุงเทพฯ)",
      "sources.cycle.realtime": "ตามเวลาจริง (ผู้รายงาน)",
      "sources.traffy.name": "Traffy Fondue (รายงานจากประชาชน)",
      "sources.row.traffy.provides.html":
        'รายงานจากประชาชน — ไม่ยืนยันโดยเซ็นเซอร์ จำกัดสถานะสูงสุดที่ระวัง <strong>รวมภาพถ่ายที่ผู้แจ้งแนบมากับตั๋วจริง</strong> ให้ดูประกอบด้วยตาตัวเองก่อนเชื่อสถานะ',
      "sources.thaiwater.name": "ThaiWater ระดับน้ำคลอง",
      "sources.row.thaiwater.provides":
        "ระดับน้ำคลองใกล้พื้นที่แผนที่ — เป็นข้อมูลประกอบ (Related condition) เท่านั้น ไม่มีผลต่อสถานะผ่านได้/ผ่านไม่ได้ของถนนใด ๆ",
      "sources.row.thaiwater.cycle": "ตามรอบของ ThaiWater",

      "sources.h.criteria": 'เกณฑ์การประเมินว่า "ผ่านได้หรือไม่"',
      "table.waterlevel": "ระดับน้ำ",
      "table.status": "สถานะ",
      "table.meaning": "ความหมาย",
      "sources.criteria.clear.range": "< 10 ซม. / รายงานว่าผ่านได้",
      "sources.criteria.caution.range": "10–30 ซม.",
      "sources.criteria.caution.meaning": "ผ่านได้แต่ระวัง / รถสูงเท่านั้น",
      "sources.criteria.blocked.range": "> 30 ซม. / รายงานว่าผ่านไม่ได้",
      "sources.criteria.blocked.meaning": "ถือว่าผ่านไม่ได้",
      "sources.criteria.unknown.range": "ไม่ระบุ",
      "sources.criteria.unknown.meaning": 'ไม่ทราบความลึก — ถือเป็นข้อควรระวัง ไม่ใช่ "ผ่านได้"',
      "sources.criteria.note.html":
        'รายงานที่ระบุคำตัดสินชัดเจน ("ผ่านได้" หรือ "ผ่านไม่ได้") จะยึดตามคำนั้นเสมอ ไม่ว่าตัวเลขความลึกในข้อความเดียวกันจะเป็นเท่าใด',

      "sources.h.freshness": "ความสดใหม่ของข้อมูล",
      "sources.freshness.li1.html": 'แสดงเฉพาะรายงานที่ยัง <strong>active</strong> ขณะนี้เท่านั้น',
      "sources.freshness.li2": 'ตัวกรอง "แสดงข้อมูลไม่เกิน" บนหน้าแผนที่ ปรับช่วงเวลาได้ (15 นาที–3 ชม.)',
      "sources.freshness.li3.html": 'รายงานเกิน 60 นาทีจะมีป้าย <span class="stale-tag">ข้อมูลเก่า</span> กำกับเสมอ',
      "sources.freshness.li4": "โหลดข้อมูลไม่สำเร็จ ระบบแจ้งเตือนแทนการแสดงตัวเลขเก่า",

      "sources.h.limitations": "ข้อจำกัด",
      "sources.limitations.li1": "ครอบคลุมเฉพาะจุดที่มีเซ็นเซอร์หรือมีผู้รายงาน — ซอยเล็กจำนวนมากอาจไม่มีข้อมูล",
      "sources.limitations.li2": "ไม่มีระบบนำทาง — ใช้ร่วมกับ Google Maps / Longdo Maps",
      "sources.limitations.li3": "เกณฑ์ความลึกเป็นการประมาณอย่างง่าย ไม่รวมกระแสน้ำหรือสิ่งกีดขวางใต้น้ำ",

      "sources.status.updating": "กำลังอัปเดตข้อมูล…",
      "sources.status.updated": "อัปเดตล่าสุด {time}",
      "sources.status.failed": "อัปเดต {time} — มีแหล่งข้อมูลโหลดไม่สำเร็จ",
      "sources.badge.offline": "โหลดไม่สำเร็จ",
      "sources.card.error": "ไม่สามารถโหลดข้อมูลจากแหล่งนี้ได้ในขณะนี้ — ลองรีเฟรชอีกครั้ง",
      "sources.stat.activepoints": "จุด active",
      "sources.stat.latest": "รายงานล่าสุด",
      "sources.stat.oldestactive": "รายงานเก่าสุดที่ยัง active",
      "sources.stat.stations": "สถานี",
      "sources.stat.latestvalue": "ค่าล่าสุด",
      "sources.stat.oldestvalue": "ค่าเก่าสุด",
      "sources.bma.extra": "เซ็นเซอร์ {sensorCount} จุด · {notificationCount} รายงานต่อรอบ",
      "sources.longdo.extra": "ฟีด {eventCount} รายการ · น้ำท่วม {floodEventCount} รายการ (ทั้งประเทศ) · active ในกรุงเทพฯ {activeCount} รายการ",
      "sources.traffy.extra": "ตั๋วในฟีด {ticketCount} รายการ · น้ำท่วม {floodTicketCount} รายการ · active {activeCount} รายการ",
      "sources.traffy.note.html":
        'Endpoint ไม่เป็นทางการ อาจเปลี่ยนแปลงได้ — จำกัดสถานะสูงสุดที่ "ระวัง" เพราะยังไม่ยืนยันโดยเซ็นเซอร์ — <strong>ใช้ภาพถ่ายจริงจากผู้แจ้งบน Traffy</strong> เมื่อมีแนบมากับตั๋ว',
      "sources.thaiwater.note":
        "ใช้ public fallback API key ของ ThaiWater ไม่ใช่ key ที่ลงทะเบียนของเราเอง อาจหยุดทำงานได้หาก ThaiWater เปลี่ยนหรือยกเลิก key นี้",

      "contact.h.author": "ผู้จัดทำ",
      "contact.note.personal": "โปรเจกต์ส่วนตัว — ไม่ใช่ช่องทางทางการ",
    },

    en: {
      "doc.title.index": "BKK Road Flood 2026 — Check flooded roads in Bangkok",
      "doc.title.sources": "Sources — BKK Road Flood 2026",
      "doc.title.contact": "Contact — BKK Road Flood 2026",

      "nav.map": "Map",
      "nav.sources": "Sources",
      "nav.contact": "Contact",

      "status.loading": "Loading…",
      "refresh.title": "Refresh data",
      "refresh.label": "Refresh",

      "sidebar.roadlist": "Road list",
      "myroute.title": "My route",
      "myroute.empty": 'No roads selected yet — click "+" or click a pin on the map',
      "search.title": "Search roads",
      "freshness.label": "Show reports within",
      "freshness.15": "15 min",
      "freshness.30": "30 min",
      "freshness.60": "1 hour",
      "freshness.180": "3 hours (all)",
      "camera.toggle": "CCTV cameras (BMA)",
      "canal.toggle": "Canal water level (ThaiWater)",
      "road.search.placeholder": "Type a road name, e.g. Lat Phrao, Ekkachai…",
      "legend.clear": "Clear",
      "legend.caution": "Passable with caution",
      "legend.blocked": "Blocked",
      "legend.unknown": "Unknown water level",
      "legend.stale": "Stale",
      "legend.stale.suffix": " = report older than 1 hr",
      "canal.legend.warning": "Warning",
      "canal.legend.critical": "Critical",
      "canal.legend.unknownthreshold": "Threshold unknown",
      "canal.legend.note": "(Normal-level stations aren't shown on the map)",
      "relatedcanal.title": "Nearby canal water levels",
      "relatedcanal.note": "Contextual data, not a road report — for reference only",
      "disclaimer.notofficial": "Not an official channel",
      "disclaimer.follow": " — follow announcements from",
      "disclaimer.agencies": "BMA, TMD, DDPM",
      "disclaimer.hotline": "Hotline",
      "disclaimer.sourcedetails": "Source details",

      "flyto.title": "Click to fly to this spot on the map",
      "floodcentre.toggle": "Flooded roads (BMA flood centre)",
      "floodcentre.source": "Source: BMA Flood Prevention Centre",
      "floodcentre.unknowntime": "Update time unknown",
      "floodcentre.approx": "Approximate location",
      "floodcentre.note": "Contextual data, not a road report",
      "floodcentre.error": "Couldn't load BMA's flooded-roads list",
      "gistda.toggle": "24-hour flood warning (GISTDA)",
      "gistda.legend": "GISTDA 24-hour flood warning (area-level; update time unknown)",
      "gistda.watch": "Watch",
      "gistda.warning": "Flood warning",
      "gistda.note": "Contextual data, not a road report",
      "gistda.error": "Couldn't load GISTDA's warning layer",
      "summary.title": "Right now",
      "summary.blocked": "Blocked",
      "summary.caution": "Caution",
      "summary.clear": "Clear",
      "summary.scope.city": "All Bangkok · reports within {age}",
      "summary.scope.near": "Within {km} km of you · reports within {age}",
      "summary.nearest": "Nearest blocked road: {name} ({dist})",
      "summary.nearest.none": "No blocked-road reports within this radius",
      "summary.empty": "No reports in this time window",
      "summary.dist.m": "{n} m",
      "summary.dist.km": "{n} km",
      "nearme.btn": "Use my location",
      "nearme.off": "Show all Bangkok",
      "nearme.finding": "Finding your location…",
      "nearme.denied": "Location permission was denied",
      "nearme.error": "Couldn't get your location",
      "nearme.outside": "Your location is outside Bangkok",
      "nearme.privacy": "Location stays in your browser — not sent or stored",
      "canal.popup.note": "Contextual data, not a road report",
      "canal.trend.rising": "▲ Rising",
      "canal.trend.falling": "▼ Falling",
      "canal.trend.steady": "● Steady",
      "canal.trend.prev": "(previous {n} m)",
      "canal.margin.under": "{n} m below critical level",
      "canal.margin.over": "{n} m over critical level",
      "camera.popup.note": "Link opens BMA's general Traffic viewer — not this specific camera",
      "camera.popup.link": "View on BMA ↗",
      "photo.cue.title": "Has a photo — view it to judge for yourself",
      "canal.status.loading": "Loading canal water levels…",
      "canal.status.none": "No canal water level data right now",
      "canal.status.error": "Failed to load canal water level data",
      "report.photo.alt": "Photo from the reporter",
      "gallery.title": "Latest report photos",
      "gallery.note": "Photos from citizen reports, newest first. Not a road status — always check the photo's age.",
      "gallery.more": "Show more",
      "gallery.counts.title": "Reports in the last {hours} h (a count of reports, not a flood level)",
      "gallery.counts.item": "{district} · {n} reports",
      "gallery.district.label": "Choose a district",
      "gallery.district.all": "All districts",
      "gallery.search.placeholder": "Search a place, e.g. soi, road, village…",
      "gallery.empty.none": "No recent reports in this area (this does not mean it is dry).",
      "gallery.empty.stale": "The nearest data is too old or too far away to say.",
      "gallery.empty": "No report photos right now.",
      "gallery.incomplete": "Could not load Traffy Fondue, so this list may be incomplete.",
      "corroboration.note": "Confirmed by {n} reports:",
      "popup.status.label": "Status:",
      "popup.source.label": "Source:",
      "citizen.note": "Citizen report — not sensor-confirmed",
      "popup.addbtn": "Add to route",
      "roadlist.hasphoto": "Has photo",
      "roadlist.empty.none": "No flood reports right now",
      "roadlist.empty.nomatch": "No matching road found",
      "roadlist.empty.filtered": "No reports in this time window — try widening the filter",
      "road.addremove.title": "Add/remove from route",
      "route.list.empty": 'No roads selected yet — click "+" from the list below, or click a pin on the map',
      "route.remove.title": "Remove",
      "verdict.blocked": ' Blocked — "{road}" has deep flooding',
      "verdict.caution": ' Caution — "{road}" flooded {depth} cm',
      "verdict.unknown": ' Unknown water level at "{road}"',
      "verdict.clear": " Clear — no severe flood reports on this route",
      "status.updating": "Updating…",
      "status.updated": "Updated {time} · {visible}/{total} points",
      "status.failed": "Updated {time} — failed to load {sources}",
      "unit.depth": "{n} cm",
      "unit.meters": "{n} m",

      "time.unknown": "Unknown time",
      "time.now": "Just now",
      "time.minutesAgo": "{n} min ago",
      "time.hoursAgo": "{n} hr ago",
      "duration.minutes": "{n} min",
      "duration.hours": "{n} hr",

      "sources.h.status": "Current source status",
      "sources.h.sources": "Data sources",
      "table.source": "Source",
      "table.provides": "What it provides",
      "table.updatecycle": "Update cycle",
      "sources.row.bma.provides": "~254 water-level sensors, live depth readings",
      "sources.row.bma.cycle": "~3 min",
      "sources.row.longdo.provides": "Reports from the Dept. of Highways, BMA Drainage & Sewerage, iTIC users (filtered to Bangkok)",
      "sources.cycle.realtime": "Real-time (as reported)",
      "sources.traffy.name": "Traffy Fondue (citizen reports)",
      "sources.row.traffy.provides.html":
        "Citizen reports — not sensor-confirmed. Status capped at caution. <strong>Includes photos reporters attach to real tickets</strong> — view them yourself before trusting the status.",
      "sources.thaiwater.name": "ThaiWater canal water level",
      "sources.row.thaiwater.provides":
        "Canal water levels near the map area — contextual data (Related condition) only, doesn't affect any road's passable/blocked status",
      "sources.row.thaiwater.cycle": "On ThaiWater's own cycle",

      "sources.h.criteria": 'Criteria for "passable or not"',
      "table.waterlevel": "Water level",
      "table.status": "Status",
      "table.meaning": "Meaning",
      "sources.criteria.clear.range": "< 10 cm / reported passable",
      "sources.criteria.caution.range": "10–30 cm",
      "sources.criteria.caution.meaning": "Passable with caution / high-clearance vehicles only",
      "sources.criteria.blocked.range": "> 30 cm / reported impassable",
      "sources.criteria.blocked.meaning": "Treated as blocked",
      "sources.criteria.unknown.range": "Not specified",
      "sources.criteria.unknown.meaning": 'Unknown depth — treated as caution, not "clear"',
      "sources.criteria.note.html":
        'A report with an explicit verdict ("passable" or "not passable") always takes precedence over any depth figure in the same text.',

      "sources.h.freshness": "Data freshness",
      "sources.freshness.li1.html": 'Only reports still <strong>active</strong> right now are shown',
      "sources.freshness.li2": 'The "Show reports within" filter on the map page adjusts the time window (15 min–3 hr)',
      "sources.freshness.li3.html": 'Reports older than 60 minutes always carry a <span class="stale-tag">Stale</span> tag',
      "sources.freshness.li4": "When a fetch fails, the app shows a warning instead of old numbers",

      "sources.h.limitations": "Limitations",
      "sources.limitations.li1": "Only covers points with a sensor or a report — many small sois may have no data",
      "sources.limitations.li2": "No turn-by-turn navigation — use alongside Google Maps / Longdo Maps",
      "sources.limitations.li3": "Depth thresholds are a simple estimate — currents and submerged obstacles aren't accounted for",

      "sources.status.updating": "Updating data…",
      "sources.status.updated": "Last updated {time}",
      "sources.status.failed": "Updated {time} — some sources failed to load",
      "sources.badge.offline": "Failed to load",
      "sources.card.error": "Couldn't load data from this source right now — try refreshing",
      "sources.stat.activepoints": "active points",
      "sources.stat.latest": "latest report",
      "sources.stat.oldestactive": "oldest active report",
      "sources.stat.stations": "stations",
      "sources.stat.latestvalue": "latest value",
      "sources.stat.oldestvalue": "oldest value",
      "sources.bma.extra": "{sensorCount} sensors · {notificationCount} reports per cycle",
      "sources.longdo.extra": "{eventCount} feed items · {floodEventCount} flood events (nationwide) · {activeCount} active in Bangkok",
      "sources.traffy.extra": "{ticketCount} tickets in feed · {floodTicketCount} flood tickets · {activeCount} active",
      "sources.traffy.note.html":
        'Unofficial endpoint, may change without notice — status capped at "caution" since it isn\'t sensor-confirmed — <strong>real photos from Traffy reporters are used</strong> when attached to a ticket.',
      "sources.thaiwater.note":
        "Uses ThaiWater's public fallback API key, not a key registered to us — may stop working if ThaiWater changes or revokes it.",

      "contact.h.author": "Author",
      "contact.note.personal": "Personal project — not an official channel",
    },
  };

  let currentLang = null;

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "th" || saved === "en") return saved;
    } catch (err) {
      // localStorage unavailable (private mode, etc.) — fall through to default
    }
    return "th"; // always defaults to Thai for a first-time visitor; EN is opt-in
  }

  function getLang() {
    if (!currentLang) currentLang = detectLang();
    return currentLang;
  }

  function t(key, vars) {
    const lang = getLang();
    let str = (DICT[lang] && DICT[lang][key]) ?? DICT.th[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.split(`{${k}}`).join(v);
      }
    }
    return str;
  }

  // Composed helpers for values that depend on FloodData (data.js) but still
  // need a language — kept here rather than in data.js so data.js stays pure
  // and lang-free (see docs/adr/0006).
  function timeAgo(iso) {
    const FD = globalTarget.FloodData;
    if (!iso || !FD) return t("time.unknown");
    const mins = Math.round(FD.ageMinutes(iso));
    if (!Number.isFinite(mins)) return t("time.unknown");
    if (mins < 1) return t("time.now");
    if (mins < 60) return t("time.minutesAgo", { n: mins });
    return t("time.hoursAgo", { n: Math.round(mins / 60) });
  }

  function fmtDuration(mins) {
    if (mins == null) return "—";
    if (mins < 1) return t("time.now");
    if (mins < 60) return t("duration.minutes", { n: Math.round(mins) });
    return t("duration.hours", { n: (mins / 60).toFixed(1) });
  }

  function fmtDepth(cm) {
    return t("unit.depth", { n: cm });
  }

  function fmtMeters(m) {
    return t("unit.meters", { n: m });
  }

  function fmtTime(date) {
    const locale = getLang() === "en" ? "en-GB" : "th-TH";
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  function applyTranslations(root) {
    if (typeof document === "undefined") return;
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.title = t(el.getAttribute("data-i18n-title"));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
    });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
  }

  // A bare "EN"/"ไทย" reads as a status label, not a clickable control — the
  // 🌐 glyph plus a title tooltip marks it as a language switcher at a
  // glance, for a visitor who might otherwise not notice it.
  function updateToggleButton() {
    const btn = document.getElementById("lang-toggle");
    if (!btn) return;
    const lang = getLang();
    btn.textContent = lang === "th" ? "🌐 EN" : "🌐 ไทย";
    btn.title = lang === "th" ? "Switch to English" : "เปลี่ยนเป็นภาษาไทย";
  }

  function setLang(lang) {
    currentLang = lang === "en" ? "en" : "th";
    try {
      localStorage.setItem(STORAGE_KEY, currentLang);
    } catch (err) {
      // localStorage unavailable — toggle still works for this page view
    }
    if (typeof document === "undefined") return;
    document.documentElement.lang = currentLang;
    applyTranslations();
    updateToggleButton();
    document.dispatchEvent(new CustomEvent("i18n:change", { detail: { lang: currentLang } }));
  }

  function toggleLang() {
    setLang(getLang() === "th" ? "en" : "th");
  }

  function init() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = getLang();
    applyTranslations();
    updateToggleButton();
    const btn = document.getElementById("lang-toggle");
    if (btn) btn.addEventListener("click", toggleLang);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  globalTarget.I18n = { t, getLang, setLang, toggleLang, applyTranslations, timeAgo, fmtDuration, fmtDepth, fmtMeters, fmtTime, DICT };
})();
