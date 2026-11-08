import test from "node:test";
import assert from "node:assert/strict";
import { requireVersionBump, versionParts } from "../scripts/check-version.mjs";
test("release versions require a valid increasing major.minor.patch", () => {
  for (const [current, previous] of [
    ["1.0.0", "0.1.0"],
    ["1.0.1", "1.0.0"],
    ["1.1.0", "1.0.9"],
    ["2.0.0", "1.9.9"],
  ])
    assert(requireVersionBump(current, previous));
  for (const current of ["1.0.0", "0.9.9", "0.10.0"])
    assert.throws(() => requireVersionBump(current, "1.0.0"));
  for (const value of [
    "1",
    "1.0",
    "01.0.0",
    "1.0.0-preview",
    "1.0.-1",
    "99999999999999999999.0.0",
  ])
    assert.throws(() => versionParts(value));
});
