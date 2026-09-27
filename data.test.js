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
