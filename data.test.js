// Tests for data.js's pure, source-agnostic logic — run with `node --test`.
// No network, no DOM: only the exported pure functions on window.FloodData.
const test = require("node:test");
const assert = require("node:assert/strict");
require("./data.js");
const FD = globalThis.FloodData;

test("capCitizenSeverity downgrades red to yellow", () => {
  assert.equal(FD.capCitizenSeverity("red"), "yellow");
});

test("capCitizenSeverity leaves yellow, green, and gray unchanged", () => {
  assert.equal(FD.capCitizenSeverity("yellow"), "yellow");
  assert.equal(FD.capCitizenSeverity("green"), "green");
  assert.equal(FD.capCitizenSeverity("gray"), "gray");
});

test("ageMinutes treats a naive Longdo/Traffy timestamp as Bangkok time (UTC+7), not the runtime's local timezone", () => {
  // "2026-09-28 09:31:47" Bangkok local == "2026-09-28T02:31:47.000Z" UTC.
  // Before the fix, `new Date()` on the naive string would parse it as
  // local-to-the-test-runner time instead — wrong by the runner's own UTC
  // offset. Comparing against a fixed, explicit UTC instant makes this
  // assertion correct regardless of what timezone `node --test` runs in.
  const now = new Date("2026-09-28T02:33:47.000Z").getTime();
  const naive = "2026-09-28 09:31:47"; // Bangkok local, no zone marker
  const realInstant = new Date("2026-09-28T02:31:47.000Z").getTime();

  const originalNow = Date.now;
  Date.now = () => now;
  try {
    assert.equal(Math.round(FD.ageMinutes(naive)), Math.round((now - realInstant) / 60000));
  } finally {
    Date.now = originalNow;
  }
});

test("ageMinutes leaves an already-zoned timestamp (BMA's ISO8601 + Z) untouched", () => {
  const now = new Date("2026-09-28T02:33:47.000Z").getTime();
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    assert.equal(Math.round(FD.ageMinutes("2026-09-28T02:20:00.000Z")), 14);
  } finally {
    Date.now = originalNow;
  }
});

function point(overrides) {
  return {
    key: "p",
    label: "Test Road",
    sublabel: "",
    status: "yellow",
    depthCm: 15,
    updated: new Date().toISOString(),
    source: "BMA",
    lat: 13.7563,
    lng: 100.5018,
    text: "",
    ...overrides,
  };
}

test("mergeCorroboration merges two nearby, fresh points into one, listing both as contributors", () => {
  const a = point({ key: "bma-1", lat: 13.7563, lng: 100.5018, status: "yellow" });
  // ~50m north of `a`.
  const b = point({ key: "traffy-1", lat: 13.7568, lng: 100.5018, status: "yellow", source: "Traffy Fondue" });

  const merged = FD.mergeCorroboration([a, b]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].contributors.length, 2);
  const keys = merged[0].contributors.map((c) => c.key).sort();
  assert.deepEqual(keys, ["bma-1", "traffy-1"]);
});

test("mergeCorroboration leaves points more than 300m apart as separate markers", () => {
  const a = point({ key: "bma-1", lat: 13.7563, lng: 100.5018 });
  // ~1.1km away.
  const b = point({ key: "traffy-1", lat: 13.7663, lng: 100.5018 });

  const merged = FD.mergeCorroboration([a, b]);

  assert.equal(merged.length, 2);
});

test("mergeCorroboration leaves a stale point unmerged even if nearby", () => {
  const fresh = point({ key: "bma-1", lat: 13.7563, lng: 100.5018, updated: new Date().toISOString() });
  const staleIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h old
  const stale = point({ key: "traffy-1", lat: 13.7568, lng: 100.5018, updated: staleIso });

  const merged = FD.mergeCorroboration([fresh, stale]);

  assert.equal(merged.length, 2);
});

test("mergeCorroboration chains a-b-c into one marker with all three contributors", () => {
  const a = point({ key: "a", lat: 13.7563, lng: 100.5018 });
  const b = point({ key: "b", lat: 13.7568, lng: 100.5018 }); // ~55m from a
  const c = point({ key: "c", lat: 13.7573, lng: 100.5018 }); // ~55m from b, ~110m from a

  const merged = FD.mergeCorroboration([a, b, c]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].contributors.length, 3);
});

test("mergeCorroboration's merged marker takes the worst status among contributors", () => {
  const clear = point({ key: "a", lat: 13.7563, lng: 100.5018, status: "green" });
  const blocked = point({ key: "b", lat: 13.7568, lng: 100.5018, status: "red" });

  const merged = FD.mergeCorroboration([clear, blocked]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "red");
});

// --- ThaiWater canal water-level Related condition — see CONTEXT.md ---

function canalFeature({
  lng = 100.5018,
  lat = 13.7563,
  measureValue = 1.5,
  stationId = 1,
  stationName = "Test Canal",
  measureAt = "2026-09-28T08:30:00+07:00",
} = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      id: "1",
      measureAt,
      measureValue,
      station: { id: stationId, station: stationName },
    },
  };
}

function canalResponse(features) {
  return { meta: {}, data: { "10": { type: "FeatureCollection", features } } };
}

test("parseCanalStations parses a well-formed feature", () => {
  const stations = FD.parseCanalStations(canalResponse([canalFeature()]));
  assert.equal(stations.length, 1);
  assert.equal(stations[0].label, "Test Canal");
  assert.equal(stations[0].lat, 13.7563);
  assert.equal(stations[0].lng, 100.5018);
  assert.equal(stations[0].levelM, 1.5);
  assert.equal(stations[0].updated, "2026-09-28T08:30:00+07:00");
});

test("parseCanalStations drops a feature with a missing/non-numeric level", () => {
  const stations = FD.parseCanalStations(canalResponse([canalFeature({ measureValue: null })]));
  assert.equal(stations.length, 0);
});

test("parseCanalStations drops a feature with an out-of-Bangkok coordinate", () => {
  // Chiang Mai coordinates — far outside Bangkok.
  const stations = FD.parseCanalStations(canalResponse([canalFeature({ lat: 18.7883, lng: 98.9853 })]));
  assert.equal(stations.length, 0);
});

test("parseCanalStations keeps valid features and drops invalid ones from a mixed response", () => {
  const valid = canalFeature({ stationId: 1, stationName: "Valid" });
  const badLevel = canalFeature({ stationId: 2, stationName: "Bad Level", measureValue: NaN });
  const outside = canalFeature({ stationId: 3, stationName: "Outside", lat: 18.7883, lng: 98.9853 });
  const stations = FD.parseCanalStations(canalResponse([valid, badLevel, outside]));
  assert.equal(stations.length, 1);
  assert.equal(stations[0].label, "Valid");
});

test("waterLevelStatus returns green when the level is below warningM", () => {
  assert.equal(FD.waterLevelStatus(1.5, { warningM: 1.9, criticalM: 2.2 }), "green");
});

test("waterLevelStatus returns yellow when the level is at/above warningM but below criticalM", () => {
  assert.equal(FD.waterLevelStatus(1.9, { warningM: 1.9, criticalM: 2.2 }), "yellow");
  assert.equal(FD.waterLevelStatus(2.1, { warningM: 1.9, criticalM: 2.2 }), "yellow");
});

test("waterLevelStatus returns red when the level is at/above criticalM", () => {
  assert.equal(FD.waterLevelStatus(2.2, { warningM: 1.9, criticalM: 2.2 }), "red");
  assert.equal(FD.waterLevelStatus(3.0, { warningM: 1.9, criticalM: 2.2 }), "red");
});

test("waterLevelStatus returns null (never a guessed green) when no threshold is known", () => {
  assert.equal(FD.waterLevelStatus(1.5, null), null);
  assert.equal(FD.waterLevelStatus(1.5, undefined), null);
});

function station(overrides) {
  return {
    key: "s",
    label: "Station",
    lat: 13.7563,
    lng: 100.5018,
    levelM: 1,
    updated: new Date().toISOString(),
    ...overrides,
  };
}

test("nearestStations returns the closest `limit` stations in distance order", () => {
  const near = station({ key: "near", lat: 13.7568, lng: 100.5018 }); // ~55m
  const mid = station({ key: "mid", lat: 13.7600, lng: 100.5018 }); // ~410m
  const far = station({ key: "far", lat: 13.8000, lng: 100.5018 }); // ~4.8km

  const result = FD.nearestStations([far, near, mid], 13.7563, 100.5018, 2);

  assert.deepEqual(result.map((s) => s.key), ["near", "mid"]);
});

test("nearestStations returns all stations when there are fewer than `limit`", () => {
  const a = station({ key: "a" });
  const b = station({ key: "b", lat: 13.7568 });

  const result = FD.nearestStations([a, b], 13.7563, 100.5018, 5);

  assert.equal(result.length, 2);
});

test("nearestStations doesn't throw on equal-distance ties", () => {
  const a = station({ key: "a", lat: 13.7568, lng: 100.5018 });
  const b = station({ key: "b", lat: 13.7558, lng: 100.5018 });

  assert.doesNotThrow(() => FD.nearestStations([a, b], 13.7563, 100.5018, 2));
});

// --- Traffy / Longdo parsers — characterization + fixtures ---

const NOW_ISO = "2026-10-01T12:00:00+07:00";
const NOW_MS = new Date(NOW_ISO).getTime();
const STOCK_PHOTO =
  "https://storage.googleapis.com/traffy_public_bucket/attachment/2022-12/da2125e781282589d482070c3dba1726aa16a4a7.jpg";

function traffyFeature({
  id = "t1",
  lat = 13.7563,
  lng = 100.5018,
  timestamp = "2026-10-01 11:30:00",
  state = "กำลังดำเนินการ",
  photo_url = "https://example.com/real-1.jpg",
  description = "น้ำท่วมสูง 15 ซม.",
  type = ["น้ำท่วม"],
  address = "ถนนทดสอบ",
} = {}) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: {
      ticket_id: id,
      problem_type_fondue: type,
      timestamp,
      state,
      photo_url,
      description,
      address,
      subdistrict: "แขวงทดสอบ",
      district: "เขตทดสอบ",
    },
  };
}

// Runs fn with Date.now and global fetch stubbed, so the load* wrappers can
// be characterized against a fixed response.
async function withStubbedNetwork(response, fn) {
  const origNow = Date.now;
  const origFetch = globalThis.fetch;
  Date.now = () => NOW_MS;
  globalThis.fetch = async () => ({ ok: true, json: async () => response });
  try {
    return await fn();
  } finally {
    Date.now = origNow;
    globalThis.fetch = origFetch;
  }
}

const traffyFixture = {
  features: [
    traffyFeature({ id: "ok", photo_url: "https://example.com/real-1.jpg" }),
    traffyFeature({ id: "stock", photo_url: STOCK_PHOTO, lat: 13.76 }),
    traffyFeature({ id: "dup1", photo_url: "https://example.com/dup.jpg", lat: 13.77 }),
    traffyFeature({ id: "dup2", photo_url: "https://example.com/dup.jpg", lat: 13.78 }),
    traffyFeature({ id: "dup3", photo_url: "https://example.com/dup.jpg", lat: 13.79 }),
    traffyFeature({ id: "resolved", state: "เสร็จสิ้น", photo_url: "https://example.com/r.jpg" }),
    traffyFeature({ id: "expired", timestamp: "2026-10-01 07:00:00", photo_url: "https://example.com/e.jpg" }),
    traffyFeature({ id: "nobkk", lat: 18.79, lng: 98.98, photo_url: "https://example.com/n.jpg" }),
    traffyFeature({ id: "notflood", type: ["ถนน"], photo_url: "https://example.com/f.jpg" }),
  ],
};

test("characterization: loadTraffy output on a fixture", async () => {
  const result = await withStubbedNetwork(traffyFixture, () => FD.loadTraffy());
  assert.equal(result.ticketCount, 9);
  assert.equal(result.floodTicketCount, 8);
  const byKey = Object.fromEntries(result.points.map((p) => [p.key, p]));
  assert.deepEqual(Object.keys(byKey).sort(), ["traffy-dup1", "traffy-dup2", "traffy-dup3", "traffy-ok", "traffy-stock"]);
  assert.equal(byKey["traffy-ok"].photoUrl, "https://example.com/real-1.jpg");
  assert.equal(byKey["traffy-ok"].depthCm, 15);
  assert.equal(byKey["traffy-ok"].status, "yellow");
  assert.equal(byKey["traffy-ok"].source, "Traffy Fondue");
  assert.equal(byKey["traffy-ok"].label, "ถนนทดสอบ");
  assert.equal(byKey["traffy-ok"].sublabel, "แขวงทดสอบ เขตทดสอบ");
  assert.equal(byKey["traffy-ok"].updated, "2026-10-01T11:30:00");
});

test("parseTraffy matches loadTraffy and is pure given `now`", () => {
  const result = FD.parseTraffy(traffyFixture, NOW_MS);
  assert.equal(result.points.length, 5);
});

test("parseTraffy drops the stock placeholder photo (known URL, even when only one ticket)", () => {
  const { points } = FD.parseTraffy({ features: [traffyFeature({ id: "s", photo_url: STOCK_PHOTO })] }, NOW_MS);
  assert.equal(points[0].photoUrl, null);
});

test("parseTraffy drops a photo URL repeated across 3+ tickets, keeps one repeated twice", () => {
  const twice = FD.parseTraffy(
    { features: [traffyFeature({ id: "a", photo_url: "https://x/y.jpg" }), traffyFeature({ id: "b", photo_url: "https://x/y.jpg" })] },
    NOW_MS
  );
  assert.equal(twice.points[0].photoUrl, "https://x/y.jpg");
  const thrice = FD.parseTraffy(traffyFixture, NOW_MS);
  const dup = thrice.points.find((p) => p.key === "traffy-dup1");
  assert.equal(dup.photoUrl, null);
});

test("parseTraffy excludes resolved/cancelled, expired (>3h), and out-of-Bangkok tickets", () => {
  const keys = FD.parseTraffy(traffyFixture, NOW_MS).points.map((p) => p.key);
  assert.ok(!keys.includes("traffy-resolved"));
  assert.ok(!keys.includes("traffy-expired"));
  assert.ok(!keys.includes("traffy-nobkk"));
  assert.ok(!keys.includes("traffy-notflood"));
});

function longdoEvent(overrides) {
  return {
    eid: "e1",
    icon: "flood",
    latitude: "13.7563",
    longitude: "100.5018",
    title: "น้ำท่วม",
    description: "น้ำท่วมสูง 20 ซม.",
    start: "2026-10-01 11:00:00",
    stop: "2026-10-01 23:59:59",
    contributor: "iTIC",
    ...overrides,
  };
}

test("characterization: loadLongdo output on a fixture", async () => {
  const events = [longdoEvent(), longdoEvent({ eid: "other", icon: "accident" })];
  const result = await withStubbedNetwork(events, () => FD.loadLongdo());
  assert.equal(result.eventCount, 2);
  assert.equal(result.floodEventCount, 1);
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].key, "longdo-e1");
  assert.equal(result.points[0].depthCm, 20);
  assert.equal(result.points[0].status, "yellow");
  assert.equal(result.points[0].source, "Longdo/iTIC · iTIC");
  assert.equal(result.points[0].updated, "2026-10-01T11:00:00");
});

test("parseLongdo drops events whose stop time has passed", () => {
  const { points } = FD.parseLongdo([longdoEvent({ stop: "2026-10-01 10:00:00" })], NOW_MS);
  assert.equal(points.length, 0);
});

test("parseLongdo keeps an event with no stop within 3h and drops it after", () => {
  const fresh = FD.parseLongdo([longdoEvent({ stop: "", start: "2026-10-01 10:00:00" })], NOW_MS);
  assert.equal(fresh.points.length, 1);
  const old = FD.parseLongdo([longdoEvent({ stop: "", start: "2026-10-01 07:00:00" })], NOW_MS);
  assert.equal(old.points.length, 0);
});

test("parseLongdo drops non-flood and out-of-Bangkok events", () => {
  const { points, floodEventCount } = FD.parseLongdo(
    [longdoEvent({ eid: "a", icon: "accident" }), longdoEvent({ eid: "b", latitude: "18.79", longitude: "98.98" })],
    NOW_MS
  );
  assert.equal(points.length, 0);
  assert.equal(floodEventCount, 1);
});

// --- Canal trend + margin to critical (ticket 08) ---

test("canalTrend is null with no previous reading (first load or missing)", () => {
  assert.equal(FD.canalTrend(null, 1.2), null);
  assert.equal(FD.canalTrend(undefined, 1.2), null);
});

test("canalTrend reports rising, falling, and steady (equal readings)", () => {
  assert.equal(FD.canalTrend(1.0, 1.2), "rising");
  assert.equal(FD.canalTrend(1.2, 1.0), "falling");
  assert.equal(FD.canalTrend(1.2, 1.2), "steady");
});

test("canalMarginToCriticalM is sourced from the threshold table only", () => {
  assert.equal(FD.canalMarginToCriticalM(1.5, { warningM: 1.9, criticalM: 2.2 }), 0.7);
  assert.equal(FD.canalMarginToCriticalM(2.5, { warningM: 1.9, criticalM: 2.2 }), -0.3);
  assert.equal(FD.canalMarginToCriticalM(1.5, null), null);
});

test("parseCanalStations adds marginToCriticalM only when thresholds are known", () => {
  const known = FD.parseCanalStations(canalResponse([canalFeature({ measureValue: 0.27 })]));
  assert.equal(known[0].marginToCriticalM, null); // test station code isn't in the table
  const raw = canalResponse([canalFeature({ measureValue: 0.27 })]);
  raw.data["10"].features[0].properties.station.stationCode = "C00000002-WL.HMK.03"; // critical 1.03
  assert.equal(FD.parseCanalStations(raw)[0].marginToCriticalM, 0.76);
});

test("withCanalTrend: first load has no trend; a changed reading compares to the prior one", () => {
  const s1 = [{ key: "a", levelM: 1.0, updated: "t1" }];
  const first = FD.withCanalTrend(s1, new Map());
  assert.equal(first.stations[0].trend, null);
  const s2 = [{ key: "a", levelM: 1.3, updated: "t2" }];
  const second = FD.withCanalTrend(s2, first.history);
  assert.equal(second.stations[0].trend, "rising");
  assert.equal(second.stations[0].prevLevelM, 1.0);
});

test("withCanalTrend: a repeat poll of the same reading keeps the earlier comparison", () => {
  const first = FD.withCanalTrend([{ key: "a", levelM: 1.0, updated: "t1" }], new Map());
  const second = FD.withCanalTrend([{ key: "a", levelM: 1.3, updated: "t2" }], first.history);
  const third = FD.withCanalTrend([{ key: "a", levelM: 1.3, updated: "t2" }], second.history);
  assert.equal(third.stations[0].trend, "rising");
  assert.equal(third.stations[0].prevLevelM, 1.0);
});

test("withCanalTrend: equal consecutive distinct readings are steady", () => {
  const first = FD.withCanalTrend([{ key: "a", levelM: 1.0, updated: "t1" }], new Map());
  const second = FD.withCanalTrend([{ key: "a", levelM: 1.0, updated: "t2" }], first.history);
  assert.equal(second.stations[0].trend, "steady");
});

// --- BMA flood-centre flooded-roads sheet (ticket 09) ---

const SHEET_HEADER =
  '"ลำดับ","ถนน","ช่วง/จุดที่ท่วมสำคัญ","ระดับน้ำสูงสุด / สถานะ","ละติจูด (Y) โดยประมาณ","ลองจิจูด (X) โดยประมาณ"';

test("parseFloodCentreSheet parses well-formed rows into items", () => {
  const csv = [SHEET_HEADER, '"1","ลาดพร้าว","ซอยลาดพร้าว 113 - แยกบางกะปิ","30 ซม. (งดสัญจรผ่าน)*","13.7663","100.6441"'].join("\n");
  const items = FD.parseFloodCentreSheet(csv);
  assert.equal(items.length, 1);
  assert.equal(items[0].road, "ลาดพร้าว");
  assert.equal(items[0].segment, "ซอยลาดพร้าว 113 - แยกบางกะปิ");
  assert.equal(items[0].note, "30 ซม. (งดสัญจรผ่าน)*");
  assert.equal(items[0].lat, 13.7663);
  assert.equal(items[0].lng, 100.6441);
});

test("parseFloodCentreSheet drops rows with missing, non-numeric, or out-of-Bangkok coordinates", () => {
  const csv = [
    SHEET_HEADER,
    '"1","A","seg","5 ซม.","","100.6"',
    '"2","B","seg","5 ซม.","abc","100.6"',
    '"3","C","seg","5 ซม.","18.79","98.98"',
    '"4","D","seg","5 ซม.","13.8","100.6"',
  ].join("\n");
  assert.deepEqual(FD.parseFloodCentreSheet(csv).map((i) => i.road), ["D"]);
});

test("parseFloodCentreSheet handles quoted commas, escaped quotes and CRLF", () => {
  const csv = SHEET_HEADER + '\r\n"1","Road, with comma","seg ""q""","note","13.8","100.6"\r\n';
  const items = FD.parseFloodCentreSheet(csv);
  assert.equal(items[0].road, "Road, with comma");
  assert.equal(items[0].segment, 'seg "q"');
});

test("parseFloodCentreSheet returns no items for empty or header-only input", () => {
  assert.deepEqual(FD.parseFloodCentreSheet(""), []);
  assert.deepEqual(FD.parseFloodCentreSheet(SHEET_HEADER), []);
});

test("parseFloodCentreSheet items are Related-condition-shaped: no status, depth, or timestamp", () => {
  const item = FD.parseFloodCentreSheet(SHEET_HEADER + '\n"1","A","s","n","13.8","100.6"')[0];
  assert.equal(item.status, undefined);
  assert.equal(item.depthCm, undefined);
  assert.equal(item.updated, undefined);
});

// ---- Latest photos gallery (ticket 03) ----

function photoFixture() {
  // NOW is 2026-10-01 ~12:00 Bangkok; timestamps below are minutes/hours old.
  return FD.parseTraffy(
    {
      features: [
        traffyFeature({ id: "new", timestamp: "2026-10-01 11:50:00", photo_url: "https://x/new.jpg" }),
        traffyFeature({ id: "old", timestamp: "2026-10-01 01:00:00", photo_url: "https://x/old.jpg", lat: 13.76 }),
        traffyFeature({ id: "mid", timestamp: "2026-10-01 08:00:00", photo_url: "https://x/mid.jpg", lat: 13.77 }),
        traffyFeature({ id: "res", timestamp: "2026-10-01 11:00:00", state: "เสร็จสิ้น", photo_url: "https://x/res.jpg", lat: 13.78 }),
        traffyFeature({ id: "stock", timestamp: "2026-10-01 11:40:00", photo_url: STOCK_PHOTO, lat: 13.79 }),
        traffyFeature({ id: "nobkk", lat: 18.79, lng: 98.98, photo_url: "https://x/n.jpg" }),
        traffyFeature({ id: "notflood", type: ["ถนน"], photo_url: "https://x/f.jpg", lat: 13.74 }),
      ],
    },
    NOW_MS
  ).photos;
}

test("buildPhotoGallery sorts newest first and includes reports older than the verdict window", () => {
  const { items } = FD.buildPhotoGallery(photoFixture(), NOW_MS, 12, 0);
  assert.deepEqual(items.map((i) => i.key), ["traffy-new", "traffy-mid", "traffy-old"]);
  assert.ok(items[2].ageMinutes > FD.TRAFFY_FALLBACK_MS / 60000); // older than 3h, still listed
  assert.equal(items[0].photoUrl, "https://x/new.jpg");
  assert.equal(items[0].place, "ถนนทดสอบ");
  assert.equal(items[0].source, "Traffy Fondue");
  assert.equal(items[0].lat, 13.7563);
});

test("buildPhotoGallery excludes resolved/cancelled tickets and placeholder images", () => {
  const keys = FD.buildPhotoGallery(photoFixture(), NOW_MS, 12, 0).items.map((i) => i.key);
  assert.ok(!keys.includes("traffy-res"));
  assert.ok(!keys.includes("traffy-stock"));
  assert.ok(!keys.includes("traffy-nobkk"));
  assert.ok(!keys.includes("traffy-notflood"));
});

test("buildPhotoGallery pages by limit/offset and reports whether more exist", () => {
  const photos = photoFixture();
  const p1 = FD.buildPhotoGallery(photos, NOW_MS, 2, 0);
  assert.deepEqual(p1.items.map((i) => i.key), ["traffy-new", "traffy-mid"]);
  assert.equal(p1.hasMore, true);
  const p2 = FD.buildPhotoGallery(photos, NOW_MS, 2, 2);
  assert.deepEqual(p2.items.map((i) => i.key), ["traffy-old"]);
  assert.equal(p2.hasMore, false);
});

// ---- Flood-only fetch with fallback (ticket 04) ----

async function withUrlRoutedNetwork(routes, fn) {
  const origNow = Date.now;
  const origFetch = globalThis.fetch;
  const calls = [];
  Date.now = () => NOW_MS;
  globalThis.fetch = async (url) => {
    calls.push(url);
    const r = routes(url);
    if (r instanceof Error) throw r;
    return r;
  };
  try {
    return { result: await fn(), calls };
  } finally {
    Date.now = origNow;
    globalThis.fetch = origFetch;
  }
}
const okJson = (body) => ({ ok: true, json: async () => body });

test("loadTraffy requests the flood-only query first", async () => {
  const { calls } = await withUrlRoutedNetwork(() => okJson(traffyFixture), () => FD.loadTraffy());
  assert.equal(calls.length, 1);
  assert.match(calls[0], /problem_type=/);
});

test("loadTraffy falls back to the plain call when the flood-only query fails or is empty", async () => {
  for (const bad of [new Error("net"), { ok: false, status: 500 }, okJson({ features: [] }), okJson({})]) {
    const { result, calls } = await withUrlRoutedNetwork(
      (url) => (/problem_type=/.test(url) ? bad : okJson(traffyFixture)),
      () => FD.loadTraffy()
    );
    assert.equal(calls.length, 2);
    assert.doesNotMatch(calls[1], /problem_type=/);
    assert.equal(result.points.length, 5);
  }
});

test("loadTraffy rejects when both calls fail so the source shows as unavailable", async () => {
  await assert.rejects(
    withUrlRoutedNetwork(() => new Error("down"), () => FD.loadTraffy())
  );
});
