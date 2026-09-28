// Tests for i18n.js's pure lookup/formatting logic — run with `node --test`.
// No DOM here (document is undefined under Node), so this only exercises the
// language-detection default, t()'s lookup/interpolation, and the FloodData-
// dependent formatters.
const test = require("node:test");
const assert = require("node:assert/strict");
require("./data.js");
require("./i18n.js");
const I18n = globalThis.I18n;

test("getLang defaults to th with no saved preference — EN is opt-in, not auto-detected", () => {
  assert.equal(I18n.getLang(), "th");
});

test("t returns the Thai string for a known key once set to th", () => {
  I18n.setLang("th");
  assert.equal(I18n.t("nav.map"), "แผนที่");
});

test("t interpolates {var} placeholders", () => {
  I18n.setLang("th");
  assert.equal(I18n.t("corroboration.note", { n: 3 }), "ยืนยันจาก 3 รายงาน:");
});

test("t falls back to the key itself when it exists in neither language", () => {
  assert.equal(I18n.t("nonexistent.key"), "nonexistent.key");
});

test("setLang switches the active language for subsequent t() calls", () => {
  I18n.setLang("en");
  assert.equal(I18n.getLang(), "en");
  assert.equal(I18n.t("nav.map"), "Map");
  I18n.setLang("th"); // reset for other tests in this process
});

test("fmtDepth formats using the current language's unit string", () => {
  I18n.setLang("en");
  assert.equal(I18n.fmtDepth(15), "15 cm");
  I18n.setLang("th");
  assert.equal(I18n.fmtDepth(15), "15 ซม.");
});

test("timeAgo uses FloodData.ageMinutes and the current language", () => {
  const iso = new Date(Date.now() - 5 * 60000).toISOString();
  I18n.setLang("en");
  assert.equal(I18n.timeAgo(iso), "5 min ago");
  I18n.setLang("th");
  assert.equal(I18n.timeAgo(iso), "5 นาทีที่แล้ว");
});

test("fmtDuration renders sub-minute ages as 'now', not '0 min'", () => {
  I18n.setLang("en");
  assert.equal(I18n.fmtDuration(0.2), "Just now");
  I18n.setLang("th");
});
