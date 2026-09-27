// Tests for the CSV-cleaning logic in update-cameras.mjs — run with `node --test`.
// No network: only the pure parseCameraCsv function.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCameraCsv } = require("./update-cameras.mjs");

const HEADER = "ID,District,location,Code DVR, ID Camera,project,lat,long";

test("parseCameraCsv parses a well-formed row", () => {
  const csv = `${HEADER}\n1,บางพลัด,ทางด่วนยกระดับฝั่งปิ่นเกล้า ขาเข้า,TF-HW-01-01-01,TF-HW-01-02-01,proj,13.769933,100.48476\n`;
  const cameras = parseCameraCsv(csv);
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].id, "TF-HW-01-02-01");
  assert.equal(cameras[0].label, "ทางด่วนยกระดับฝั่งปิ่นเกล้า ขาเข้า");
  assert.equal(cameras[0].sublabel, "บางพลัด");
  assert.equal(cameras[0].lat, 13.769933);
  assert.equal(cameras[0].lng, 100.48476);
});

test("parseCameraCsv drops a row with a non-numeric lat/lng", () => {
  const csv = `${HEADER}\n1,บางพลัด,Test Road,DVR,CAM-1,proj,not-a-number,100.48476\n`;
  assert.equal(parseCameraCsv(csv).length, 0);
});

test("parseCameraCsv drops a row with coordinates outside the Bangkok bounding box", () => {
  // Chiang Mai coordinates — far outside Bangkok.
  const csv = `${HEADER}\n1,บางพลัด,Test Road,DVR,CAM-1,proj,18.7883,98.9853\n`;
  assert.equal(parseCameraCsv(csv).length, 0);
});

test("parseCameraCsv keeps valid rows and drops invalid ones from a mixed CSV", () => {
  const csv = `${HEADER}
1,บางพลัด,Valid Road,DVR-1,CAM-1,proj,13.769933,100.48476
2,บางพลัด,Bad Coords,DVR-2,CAM-2,proj,,100.48476
3,บางพลัด,Also Valid,DVR-3,CAM-3,proj,13.75,100.5
`;
  const cameras = parseCameraCsv(csv);
  assert.equal(cameras.length, 2);
  assert.deepEqual(cameras.map((c) => c.id), ["CAM-1", "CAM-3"]);
});
