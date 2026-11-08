import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
export function createStaticServer({
  rootDir = path.join(project, "dist/web"),
  basePath = "/",
  overrides = new Map(),
  redirectIndex = false,
} = {}) {
  rootDir = path.resolve(rootDir);
  if (!basePath.startsWith("/") || !basePath.endsWith("/"))
    throw Error("basePath must start/end with /");
  return http.createServer(async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    let relative;
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (!pathname.startsWith(basePath)) throw Error("outside scope");
      if (redirectIndex && pathname === basePath + "index.html") {
        res.writeHead(308, { Location: basePath });
        res.end();
        return;
      }
      relative = pathname.slice(basePath.length) || "index.html";
    } catch {
      res.writeHead(404);
      res.end();
      return;
    }
    const file = path.resolve(rootDir, relative);
    if (!file.startsWith(rootDir + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const data = overrides.has(relative)
        ? overrides.get(relative)
        : await fs.readFile(file);
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Cache-Control",
        /^assets\//.test(relative)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createStaticServer();
  const port = Number(process.env.PORT || 4173);
  server.listen(port, "127.0.0.1", () =>
    console.log("Local preview only: http://127.0.0.1:" + port),
  );
}
