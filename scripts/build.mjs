import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { makeIcon } from "./icon.mjs";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const hash = (s) =>
  crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
const write = (dir, name, data) => {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
};
const appVersion = JSON.parse(read("package.json")).version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(appVersion))
  throw Error("Use a major.minor.patch app version");
const template = read("src/index.html"),
  examples = read("artworks/examples.json").trim();
const core = read("src/core.cjs"),
  editor = read("src/editor.js"),
  css = read("src/style.css");
const script = (s) =>
  "<script>" + s.replaceAll("</script", "<\\/script") + "</script>";
function render(parts) {
  let html = template;
  for (const [k, v] of Object.entries(parts))
    html = html.replace("<!-- " + k + " -->", v);
  if (/<!-- [A-Z_]+ -->/.test(html)) throw Error("Unresolved template marker");
  return html;
}
export function build() {
  const web = path.join(root, "dist/web"),
    standalone = path.join(root, "dist/standalone");
  for (const dir of [web, standalone]) {
    if (
      path.dirname(dir) !== path.join(root, "dist") ||
      !["web", "standalone"].includes(path.basename(dir))
    )
      throw Error("Unsafe build output");
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())
      throw Error("Refuse symlink output");
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const assets = {};
  for (const [name, ext, data] of [
    ["style", "css", css + read("pwa/style.css")],
    ["core", "js", core],
    ["editor", "js", editor],
    ["install", "js", read("pwa/install.js")],
    ["site-footer", "js", read("pwa/site-footer.js")],
  ]) {
    const filename = "assets/" + name + "." + hash(data) + "." + ext;
    assets[name] = filename;
    write(web, filename, data);
  }
  const csp =
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'none'; worker-src 'self'; manifest-src 'self'; font-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
  const common = {
    APP_VERSION: appVersion,
    VERSION_META: `<meta name="application-version" content="${appVersion}">`,
    EXAMPLE_DATA:
      '<script id="example-data" type="application/json">' +
      examples +
      "</script>",
  };
  const head =
    '<meta http-equiv="Content-Security-Policy" content="' +
    csp +
    '"><meta name="theme-color" content="#100912"><link rel="canonical" href="https://glintile.game.brothforge.com/"><meta name="description" content="点灯匣，本地处理图片的LED点阵编辑器。"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="点灯匣"><link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./icons/icon-192.png" type="image/png"><link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">';
  const tag = (name) => '<script defer src="./' + assets[name] + '"></script>';
  write(
    web,
    "index.html",
    render({
      ...common,
      BRAND_ICON: "./icons/icon-192.png",
      HEADER_FEEDBACK: read("pwa/header-feedback.html"),
      APP_HEAD: head,
      APP_STYLE: '<link rel="stylesheet" href="./' + assets.style + '">',
      CORE_SCRIPT: tag("core"),
      EDITOR_SCRIPT: tag("editor"),
      PWA_SCRIPT: tag("install") + tag("site-footer"),
      SITE_FOOTER: read("pwa/site-footer.html"),
      PWA_PANEL: read("pwa/panel.html"),
      RUNTIME_NOTE:
        "<li>可安装的离线网页应用。首次联网完整打开后等待离线准备完成；安装方式取决于浏览器。没有账号或云端同步。</li>",
    }),
  );
  const standaloneCsp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'";
  write(
    standalone,
    "index.html",
    render({
      ...common,
      BRAND_ICON: "data:image/png;base64," + makeIcon(192).toString("base64"),
      HEADER_FEEDBACK: "",
      APP_HEAD:
        '<meta http-equiv="Content-Security-Policy" content="' +
        standaloneCsp +
        '">',
      APP_STYLE: "<style>" + css + "</style>",
      CORE_SCRIPT: script(core),
      EDITOR_SCRIPT: script(editor),
      PWA_SCRIPT: "",
      SITE_FOOTER: "",
      PWA_PANEL:
        '<p class="footer-note" data-panel="export">Copyright © 2026 骨汤造物所</p>',
      RUNTIME_NOTE:
        "<li>单文件离线版：直接用浏览器打开，即可编辑并保存作品。</li>",
    }),
  );
  const manifest = {
    id: "./",
    name: "Glintile · 点灯匣",
    short_name: "点灯匣",
    description: "在设备上制作、调整和保存LED点阵作品",
    lang: "zh-CN",
    start_url: "./",
    scope: "./",
    display: "standalone",
    orientation: "any",
    background_color: "#100912",
    theme_color: "#100912",
    icons: [
      {
        src: "icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  write(web, "manifest.webmanifest", JSON.stringify(manifest, null, 2));
  for (const [name, size, maskable] of [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["maskable-512.png", 512, true],
    ["apple-touch-icon.png", 180, false],
  ])
    write(web, "icons/" + name, makeIcon(size, maskable));
  for (const name of ["privacy.html", "legal.html"])
    write(web, name, read("public/" + name));
  const list = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    ...Object.values(assets).map((p) => "./" + p),
    "./privacy.html",
    "./legal.html",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/maskable-512.png",
    "./icons/apple-touch-icon.png",
  ];
  const version =
    appVersion +
    "-" +
    hash(
      list
        .map(
          (p) =>
            p +
            ":" +
            hash(
              fs.readFileSync(path.join(web, p === "./" ? "index.html" : p)),
            ),
        )
        .join("\n") + read("pwa/sw-template.js"),
    );
  const precache = list.map((url) => ({
    url,
    integrity:
      "sha256-" +
      crypto
        .createHash("sha256")
        .update(
          fs.readFileSync(path.join(web, url === "./" ? "index.html" : url)),
        )
        .digest("base64"),
  }));
  const sw = read("pwa/sw-template.js")
    .replace("__VERSION__", version)
    .replace("__PRECACHE__", JSON.stringify(precache));
  write(web, "sw.js", sw);
  write(web, ".nojekyll", "");
  write(web, "_headers", read("public/headers.txt"));
  console.log("Built dist/web and dist/standalone. Cache version: " + version);
  return { web, standalone, version, appVersion, assets, list };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
