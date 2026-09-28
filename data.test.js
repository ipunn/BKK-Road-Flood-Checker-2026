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
