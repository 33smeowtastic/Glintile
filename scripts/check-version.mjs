import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
export function versionParts(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  )
    throw Error("Version must use major.minor.patch");
  const parts = value.split(".").map(Number);
  if (parts.some((p) => !Number.isSafeInteger(p)))
    throw Error("Version number is too large");
  return parts;
}
export function requireVersionBump(current, previous) {
  const a = versionParts(current),
    b = versionParts(previous);
  const changed = a.findIndex((part, i) => part !== b[i]);
  if (changed < 0 || a[changed] < b[changed])
    throw Error("Each release must increase the version above " + previous);
  return true;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const base = process.argv[2] || "origin/main";
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(base))
      throw Error("Invalid base ref");
    const current = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8"),
    ).version;
    const lock = JSON.parse(
      fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
    );
    if (lock.version !== current || lock.packages[""].version !== current)
      throw Error("Package and lockfile versions must match");
    const previous = JSON.parse(
      execFileSync("git", ["show", base + ":package.json"], {
        cwd: root,
        encoding: "utf8",
      }),
    ).version;
    requireVersionBump(current, previous);
    console.log("Version check passed: " + previous + " -> " + current);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
