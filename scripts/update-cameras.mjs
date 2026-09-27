#!/usr/bin/env node
// Dev-only script: regenerates cameras.json from BMA's public bma-cctv CKAN
// dataset. NOT part of any build/deploy step — run manually and occasionally
// when someone notices the camera list is stale. See
// docs/adr/0002-camera-locations-vendored-not-live.md for why this is a
// vendored snapshot rather than a live fetch. See CONTEXT.md "Camera pin".
//
// Usage: node scripts/update-cameras.mjs

// Same bounding box data.js uses for Bangkok-scoping other sources.
const BKK_BBOX = { latMin: 13.49, latMax: 13.95, lngMin: 100.33, lngMax: 100.93 };

// A minimal CSV line parser — good enough for this dataset's plain,
// unquoted-field shape (no embedded commas/quotes observed in bma-cctv).
function parseCsvLine(line) {
  return line.split(",").map((cell) => cell.trim());
}

function parseCameraCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const idx = {
    district: header.indexOf("District"),
    location: header.indexOf("location"),
    idCamera: header.indexOf("ID Camera"),
    lat: header.indexOf("lat"),
    lng: header.indexOf("long"),
  };

  const cameras = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const lat = parseFloat(cells[idx.lat]);
    const lng = parseFloat(cells[idx.lng]);
    if (isNaN(lat) || isNaN(lng)) continue;
    if (lat < BKK_BBOX.latMin || lat > BKK_BBOX.latMax || lng < BKK_BBOX.lngMin || lng > BKK_BBOX.lngMax) continue;

    const id = cells[idx.idCamera] || cells[0];
    const label = cells[idx.location] || "กล้อง CCTV";
    const sublabel = cells[idx.district] || "";
    if (!id) continue;

    cameras.push({ id, label, sublabel, lat, lng });
  }
  return cameras;
}

async function main() {
  const pkgRes = await fetch("https://data.bangkok.go.th/api/3/action/package_show?id=bma-cctv");
  const pkg = await pkgRes.json();
  const csvResource = pkg.result.resources.find((r) => r.format?.toUpperCase() === "CSV");
  const csvRes = await fetch(csvResource.url);
  const csvText = await csvRes.text();

  const cameras = parseCameraCsv(csvText);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    new URL("../cameras.json", import.meta.url),
    JSON.stringify(cameras, null, 2) + "\n"
  );
  console.log(`Wrote ${cameras.length} cameras to cameras.json`);
}

// Only run the fetch when invoked directly (`node scripts/update-cameras.mjs`),
// not when required by tests importing parseCameraCsv. process.argv[1] may be
// relative; pathToFileURL normalizes both sides before comparing. A static
// import (not top-level await) so Node's synchronous require(esm) — used by
// update-cameras.test.js — can still load this module.
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { parseCameraCsv };
