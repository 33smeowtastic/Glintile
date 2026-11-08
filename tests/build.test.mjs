import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { build, root } from "../scripts/build.mjs";
const output = build(),
  read = (p) => fs.readFileSync(path.join(root, p), "utf8");
test("web and standalone isolate PWA capabilities", () => {
  const web = read("dist/web/index.html"),
    standalone = read("dist/standalone/index.html");
  assert.match(web, /manifest.webmanifest/);
  assert.match(web, /install\.[a-f0-9]+\.js/);
  assert.doesNotMatch(
    standalone,
    /serviceWorker|manifest.webmanifest|id="installApp"/,
  );
  assert.match(standalone, /connect-src 'none'/);
  assert.doesNotMatch(web, /<!-- [A-Z_]+ -->/);
});
test("shared editor stays local and both code bundles parse", () => {
  for (const file of ["src/core.cjs", "src/editor.js"]) {
    const s = read(file);
    new vm.Script(s);
    assert.doesNotMatch(s, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/);
  }
  new vm.Script(read("dist/web/sw.js"));
  new vm.Script(read("pwa/install.js"));
});
test("manifest and PNG icons support standalone/maskable/subpath", () => {
  const m = JSON.parse(read("dist/web/manifest.webmanifest"));
  assert.equal(m.scope, "./");
  assert.equal(m.start_url, "./");
  assert.equal(m.display, "standalone");
  assert.equal(m.orientation, "any");
  for (const icon of m.icons) {
    const b = fs.readFileSync(path.join(output.web, icon.src));
    const n = Number(icon.sizes.split("x")[0]);
    assert.equal(b.readUInt32BE(16), n);
    assert.equal(b.readUInt32BE(20), n);
  }
  assert(m.icons.some((i) => i.purpose === "maskable"));
});
test("precache uses reload requests with integrity and scoped caches", () => {
  const sw = read("dist/web/sw.js");
  assert.match(sw, /cache:\s*['"]reload['"]/);
  assert.match(sw, /integrity:\s*p.integrity/);
  assert.match(sw, /registration.scope/);
  assert.doesNotMatch(sw, /install[\s\S]{0,120}skipWaiting/);
  const list = JSON.parse(sw.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/)[1]);
  for (const e of list) {
    const b = fs.readFileSync(
      path.join(output.web, e.url === "./" ? "index.html" : e.url),
    );
    assert.equal(
      e.integrity,
      "sha256-" + crypto.createHash("sha256").update(b).digest("base64"),
    );
  }
});
test("authorship and artwork boundaries are explicit, no private source identifiers", () => {
  assert.match(read("artworks/LICENSE.md"), /不允许商用/);

  assert.match(read("README.md"), /## English/);
  assert.equal(
    JSON.parse(read("package.json")).license,
    JSON.parse(read("release.config.json")).codeLicense || "UNLICENSED",
  );
  const files = [
    "src/index.html",
    "src/editor.js",
    "src/core.cjs",
    "README.md",
    "docs/ARCHITECTURE.md",
  ];
  for (const p of files)
    assert.doesNotMatch(
      read(p),
      /libfile_[a-f0-9]+|C:\\\\Users\\\\|F:\\\\Coding\\\\|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}/,
    );
});

test("app version is consistent in package, lockfile, both builds and cache identity", () => {
  const version = JSON.parse(read("package.json")).version,
    lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[""].version, version);
  assert.equal(output.appVersion, version);
  for (const target of ["web", "standalone"]) {
    const html = read("dist/" + target + "/index.html");
    assert(
      html.includes('name="application-version" content="' + version + '"'),
    );
    assert(html.replace(/\s+/g, " ").includes("Glintile · " + version));
  }
  assert(output.version.startsWith(version + "-"));
});

test("header uses the generated PWA logo in both builds without a tagline", () => {
  const icon = fs.readFileSync(path.join(output.web, "icons/icon-192.png"));
  for (const target of ["web", "standalone"]) {
    const html = read("dist/" + target + "/index.html"),
      logo = html.match(/<img\s[^>]*class="brand-icon"[^>]*>/)?.[0];
    assert(logo, target + " header must contain an actual logo image");
    const src = logo.match(/src="([^"]+)"/)[1];
    if (target === "web") assert.equal(src, "./icons/icon-192.png");
    else assert.deepEqual(Buffer.from(src.split(",")[1], "base64"), icon);
    assert.doesNotMatch(html, /一颗一颗，点亮小小喜欢|· 试作/);
  }
});

test("share icon preserves the site's established curved-arrow glyph", () => {
  const html = read("dist/web/index.html"),
    share = html.match(/<button\s[^>]*id="headerShare"[\s\S]*?<\/button>/)[0];
  assert(
    share.includes(
      'd="M9 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-3"',
    ),
  );
  assert(
    share.includes(
      'd="M7 16C7.8 9.6 11.8 6 17 6V2.5L23 8.5L17 14.5V11C12.5 11 9.7 12.7 7 16Z"',
    ),
  );
  assert.match(share, /fill="currentColor"\s+stroke="none"/);
});

test("web feedback gift uses the existing site destination without adding it to standalone", () => {
  const web = read("dist/web/index.html"),
    standalone = read("dist/standalone/index.html");
  assert(
    web.includes(
      'href="https://www.brothforge.com/faq/feedback.html#feedback-q01"',
    ),
  );
  assert(web.includes('aria-label="填写反馈赢「月度共创礼」"'));
  assert(web.includes('d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"'));
  assert.doesNotMatch(standalone, /class="keep-button site-feedback"/);
  assert(web.includes('aria-label="Glintile · 点灯匣"'));
  assert(web.includes('class="brand-wordmark"'));
});

test("Chinese lettering is drawn from shared geometry while the approved English wordmark is preserved", () => {
  const html = read("src/index.html"),
    english = html.match(/<svg\s+class="brand-wordmark"[\s\S]*?<\/svg>/)[0],
    chinese = html.match(/<svg\s+class="chinese-name"[\s\S]*?<\/svg>/)?.[0];
  assert(
    chinese,
    "Chinese brand must use custom lettering rather than system font text",
  );
  for (const character of ["点", "灯", "匣"])
    assert(chinese.includes('data-character="' + character + '"'));
  assert.equal((chinese.match(/<circle/g) || []).length, 4);
  assert.equal(
    crypto
      .createHash("sha256")
      .update(english.replace(/\s+/g, " "))
      .digest("hex"),
    "8467ead8c36ae1e424e5a3af8469760fccec66bea37a9f021b3ca769da1dd2b1",
  );
});
