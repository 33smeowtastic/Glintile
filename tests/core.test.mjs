import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  C = require("../src/core.cjs");
const examples = JSON.parse(
  fs.readFileSync(new URL("../artworks/examples.json", import.meta.url)),
);
test("native examples are valid and bone preserves confirmed dimensions/colors/cells", () => {
  for (const e of examples)
    assert.deepEqual(C.validateProject(e.project), e.project);
  const p = examples.find((e) => e.id === "bone").project;
  assert.equal(p.width, 96);
  assert.equal(p.height, 96);
  assert.equal(p.palette.length, 24);
  assert.equal(p.cells.filter((x) => x >= 0).length, 4024);
});
test("JSON projects round-trip independently", () => {
  const p = C.blank(8, 8);
  C.paintLine(p, 0, 0, 7, 7, 0);
  const q = C.validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(q, p);
  q.cells[0] = -1;
  assert.notDeepEqual(q, p);
});
test("unsafe or oversized project data is rejected", () => {
  for (const change of [
    (p) => (p.width = 161),
    (p) => (p.height = 0),
    (p) => p.cells.pop(),
    (p) => (p.palette = ["javascript:bad"]),
    (p) => (p.cells[0] = 999),
    (p) => (p.version = 9),
    (p) => (p.unknown = true),
    (p) => (p.settings = JSON.parse('{"__proto__":{}}')),
  ]) {
    const p = C.blank(8, 8);
    change(p);
    assert.throws(() => C.validateProject(p));
  }
});
test("transparent raster leaves empty cells transparent and occupied color exact", () => {
  const p = C.blank(8, 8, ["#123456"]);
  p.cells[0] = 0;
  const r = C.rasterize(p, {
    cellSize: 12,
    shape: "square",
    background: "transparent",
    gap: 0,
  });
  assert.equal(r.width, 96);
  assert.equal(r.height, 96);
  assert.deepEqual(Array.from(r.data.slice(0, 4)), [18, 52, 86, 255]);
  const i = (20 * 96 + 20) * 4;
  assert.equal(r.data[i + 3], 0);
});
test("drawing clips to boundaries and rejects prototype contamination", () => {
  const p = C.blank(8, 8);
  C.paintLine(p, -100, 0, 100, 0, 0);
  assert.equal(p.cells.filter((c) => c === 0).length, 8);
  assert.equal({}.polluted, undefined);
});
