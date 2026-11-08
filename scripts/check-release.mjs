import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  config = JSON.parse(
    fs.readFileSync(path.join(root, "release.config.json"), "utf8"),
  );
const missing = [
  "codeLicense",
  "githubRepository",
  "copyrightHolder",
  "artworkLicense",
  "hostingProvider",
].filter((k) => !config[k]);
if (!config.publicationApproved) missing.push("publicationApproved");
for (const file of [
  "LICENSE",
  "artworks/LICENSE.md",
  "public/legal.html",
  "public/privacy.html",
])
  if (
    /待确认|待确定|尚待|须在正式上线前补齐|COPYRIGHT_HOLDER/.test(
      fs.readFileSync(path.join(root, file), "utf8"),
    )
  )
    missing.push(file + " unresolved");
if (config.siteUrl !== "https://glintile.game.brothforge.com")
  missing.push("siteUrl differs from requested game domain");
if (missing.length) {
  console.error("Not ready for public release:\n- " + missing.join("\n- "));
  process.exitCode = 1;
} else
  console.log(
    "Release metadata complete. This does not grant publication permission or verify ownership.",
  );
