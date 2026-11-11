const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  report = { checks: [], errors: [], externalRequests: [] };
const check = (name, detail) => {
  report.checks.push({ name, detail });
  console.log("PASS " + name);
};
(async () => {
  const { build } = await import("../scripts/build.mjs");
  const built = build();
  const { createStaticServer } = await import("../scripts/serve.mjs");
  const overrides = new Map(),
    server = createStaticServer({
      rootDir: built.web,
      basePath: "/preview/",
      redirectIndex: true,
      overrides,
    });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port,
    url = origin + "/preview/";
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH
        ? { executablePath: process.env.CHROME_PATH }
        : {}),
      args: ["--disable-gpu"],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    context.on("request", (req) => {
      if (
        !req.url().startsWith(origin) &&
        !req.url().startsWith("data:") &&
        !req.url().startsWith("blob:")
      )
        report.externalRequests.push(req.url());
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForFunction(() =>
      document
        .getElementById("offlineStatus")
        .textContent.includes("离线已准备好"),
    );
    const installed = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      const cache = await caches.open((await caches.keys())[0]);
      const indexAlias = await cache.match(new URL("index.html", r.scope).href);
      return {
        indexAliasRedirected: indexAlias?.redirected,
        scope: r.scope,
        active: !!r.active,
        caches: await caches.keys(),
      };
    });
    assert.equal(installed.scope, url);
    assert(installed.active);
    assert.equal(installed.indexAliasRedirected, true);
    check("PWA registers and precaches with subpath scope", installed);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    assert.match(await page.locator("#offlineStatus").innerText(), /离线/);
    check("Offline cold reload loads editor and examples");
    check("Hosting index.html redirect does not break offline navigation");
    await page.locator('[data-panel-tab="convert"]').click();
    await page.locator('[data-example="bone"]').click();
    assert.equal(
      (await page.evaluate(() => beadPlayground.getProject())).width,
      96,
    );
    await page.locator('[data-panel-tab="export"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#mobileJson").click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.cells.filter((c) => c >= 0).length, 4024);
    check("Offline native bone remains editable and exports JSON");
    await context.setOffline(false);
    await page.locator("#zoomIn").click();
    const view = await page.evaluate(() => beadPlayground.getView());
    await page.locator('[data-panel-tab="colors"]').click();
    await page.locator("#customColor").fill("#123456");
    await page.locator("#addColor").click();
    await page.locator("#undo").click();
    assert.deepEqual(await page.evaluate(() => beadPlayground.getView()), view);
    check("Undo preserves zoom and pan after modular build");
    await page.locator('[data-panel-tab="reference"]').click();
    await page.locator("#viewMode").selectOption("horizontal");
    const before = await page
      .locator("#referenceView")
      .evaluate((c) => c.toDataURL());
    await page.locator("#refScale").fill("125");
    await page.locator("#refScale").dispatchEvent("input");
    assert.notEqual(
      await page.locator("#referenceView").evaluate((c) => c.toDataURL()),
      before,
    );
    check("Shared reference controls still alter side-by-side view");
    // A stacked phone reference should use its available width, not a short strip.
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const referencePage = await phone.newPage();
    referencePage.on("pageerror", (e) => report.errors.push(e.message));
    await referencePage.goto(url);
    await referencePage.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    await referencePage.locator("#viewMode").selectOption("side");
    for (const width of [320, 390, 430]) {
      await referencePage.setViewportSize({ width, height: 844 });
      await referencePage.evaluate(() => window.scrollTo(0, 0));
      const layout = await referencePage.evaluate(() => {
        const reference = document
          .querySelector(".reference-viewport")
          .getBoundingClientRect();
        const panel = document
          .getElementById("referencePanel")
          .getBoundingClientRect();
        const stage = document.getElementById("stage").getBoundingClientRect();
        return {
          width: reference.width,
          height: reference.height,
          panelBottom: panel.bottom,
          stageTop: stage.top,
          stageHeight: stage.height,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });
      assert(
        layout.height >= layout.width * 0.95,
        `${width}px reference is too shallow: ${JSON.stringify(layout)}`,
      );
      assert(layout.panelBottom <= layout.stageTop);
      assert(layout.stageHeight >= 400);
      assert(layout.scrollWidth <= width);
      assert(layout.scrollHeight > 844);
    }
    check(
      "Stacked phone reference fills its width without shrinking the editor",
    );
    const referenceState = () =>
      referencePage.evaluate(() => ({
        view: beadPlayground.getReferenceView(),
        project: beadPlayground.getProject(),
        crop: ["refScale", "refX", "refY"].map(
          (id) => document.getElementById(id).value,
        ),
      }));
    const initialReference = await referenceState();
    await referencePage.locator("#refZoomIn").click();
    assert((await referenceState()).view.scale > initialReference.view.scale);
    await referencePage.locator("#refZoomOut").click();
    assert(
      Math.abs(
        (await referenceState()).view.scale - initialReference.view.scale,
      ) < 0.001,
    );
    const canvas = await referencePage.locator("#referenceView").boundingBox();
    const center = {
      x: canvas.x + canvas.width / 2,
      y: canvas.y + canvas.height / 2,
    };
    const touch = await phone.newCDPSession(referencePage);
    const touchPoints = (distance) => [
      { x: center.x - distance, y: center.y, id: 1 },
      { x: center.x + distance, y: center.y, id: 2 },
    ];
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: touchPoints(40),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: touchPoints(70),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    assert((await referenceState()).view.scale > 1.5);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...center, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: center.x + 35, y: center.y + 20, id: 1 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const pannedReference = await referenceState();
    assert(pannedReference.view.x > 0.05 && pannedReference.view.y > 0.02);
    assert.deepEqual(pannedReference.project, initialReference.project);
    assert.deepEqual(pannedReference.crop, initialReference.crop);
    await referencePage.locator("#refFit").click();
    assert.deepEqual((await referenceState()).view, initialReference.view);
    check(
      "Phone reference pinch, drag, zoom buttons and reset preserve crop and artwork",
    );
    await referencePage.locator("#pageScrollToggle").click();
    assert.match(
      await referencePage
        .locator("#referenceView")
        .evaluate((c) => getComputedStyle(c).touchAction),
      /pan-y/,
    );
    await referencePage.evaluate(() => window.scrollTo(0, 0));
    const topBeforeScroll = await referencePage
      .locator("#referencePanel")
      .evaluate((p) => p.getBoundingClientRect().top);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: center.x, y: center.y + 60, id: 1 }],
    });
    for (const offset of [30, 0, -40, -80, -120])
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: center.x, y: center.y + offset, id: 1 }],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await referencePage.waitForFunction(() => window.scrollY > 50);
    const topAfterScroll = await referencePage
      .locator("#referencePanel")
      .evaluate((p) => p.getBoundingClientRect().top);
    assert(topAfterScroll < topBeforeScroll - 50);
    assert.deepEqual((await referenceState()).view, initialReference.view);
    check(
      "Phone page-scroll mode moves the whole reference panel without panning its image",
    );
    await phone.close();
    await require("./reference-view.cjs")(browser, url, check);
    await require("./header-notice.cjs")(browser, url, check);
    await require("./share.cjs")(browser, url, check);
    await require("./protected-drafts.cjs")(browser, url, check);
    await require("./project-library.cjs")(browser, url, check);
    for (const [name, w, h] of [
      ["small", 320, 640],
      ["portrait", 390, 844],
      ["landscape", 844, 390],
      ["desktop", 1440, 900],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.locator('[data-panel-tab="colors"]').click();
      const shape = await page
        .locator(".swatch,.color-preview")
        .evaluateAll((nodes) =>
          nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }),
        );
      assert(
        shape.every(
          (r) => r.w >= 43.9 && r.h >= 43.9 && Math.abs(r.w - r.h) < 0.2,
        ),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      const comparison = await page.evaluate(() => {
        const reference = document
          .getElementById("referencePanel")
          .getBoundingClientRect();
        const stage = document.getElementById("stage").getBoundingClientRect();
        return {
          right: reference.right,
          left: stage.left,
          top: reference.top,
          stageTop: stage.top,
          height: reference.height,
          stageHeight: stage.height,
        };
      });
      assert(comparison.right <= comparison.left);
      assert(Math.abs(comparison.top - comparison.stageTop) < 1);
      assert(Math.abs(comparison.height - comparison.stageHeight) < 1);
      const dock = await page.evaluate(() => {
        const footer = document
          .querySelector(".site-legal")
          .getBoundingClientRect();
        const tabs = document
          .querySelector(".mobile-tabs")
          .getBoundingClientRect();
        return {
          footer: {
            top: footer.top,
            bottom: footer.bottom,
            left: footer.left,
            right: footer.right,
          },
          tabs: { top: tabs.top, bottom: tabs.bottom },
          targets: [
            ...document.querySelectorAll(".site-legal .legal-item"),
          ].map((e) => {
            const r = e.getBoundingClientRect();
            return { w: r.width, h: r.height };
          }),
        };
      });
      assert(dock.tabs.bottom <= dock.footer.top + 0.5);
      assert(dock.footer.left >= 0 && dock.footer.right <= w + 0.5);
      assert(dock.targets.every((r) => r.w >= 44 && r.h >= 44));
      check(name + " palette remains circular and fits");
    }
    await page.locator('[data-panel-tab="export"]').click();
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await page.screenshot({
      path: path.join(root, "artifacts/pwa-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".pwa-panel").evaluate((n) => (n.open = true));
    await page.locator("#offlineStatus").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(root, "artifacts/pwa-mobile.png"),
    });

    // Saturation keeps neutral defaults, alpha, preview boundaries and the artwork.
    await page.locator('[data-panel-tab="convert"]').click();
    const fixture = Buffer.from(
      await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 64;
        c.height = 64;
        const x = c.getContext("2d");
        x.fillStyle = "#6080a0";
        x.fillRect(0, 0, 32, 32);
        x.fillStyle = "rgba(160,100,130,.5)";
        x.fillRect(32, 0, 32, 32);
        x.fillStyle = "#808080";
        x.fillRect(0, 32, 32, 32);
        return c.toDataURL().split(",")[1];
      }),
      "base64",
    );
    await page.locator("#imageInput").setInputFiles({
      name: "qa-color.png",
      mimeType: "image/png",
      buffer: fixture,
    });
    await page.waitForFunction(() =>
      document.getElementById("imageName").textContent.includes("qa-color.png"),
    );
    const artworkBefore = await page.evaluate(() =>
      beadPlayground.getProject(),
    );
    const setRange = async (id, value) => {
      await page.locator("#" + id).fill(String(value));
      await page.locator("#" + id).dispatchEvent("input");
    };
    await setRange("saturation", 100);
    await setRange("brightness", 100);
    const originalSample = await page.evaluate(() =>
      Array.from(beadPlayground.sampleReference(32, 32)),
    );
    await setRange("saturation", 0);
    const monochrome = await page.evaluate(() =>
      Array.from(beadPlayground.sampleReference(32, 32)),
    );
    for (let i = 0; i < monochrome.length; i += 4) {
      assert.equal(monochrome[i + 3], originalSample[i + 3]);
      if (monochrome[i + 3])
        assert(
          monochrome[i] === monochrome[i + 1] &&
            monochrome[i + 1] === monochrome[i + 2],
        );
    }
    await setRange("brightness", 150);
    await page.locator("#resetSaturation").click();
    assert.equal(await page.locator("#brightness").inputValue(), "150");
    await setRange("brightness", 100);
    assert.deepEqual(
      await page.evaluate(() =>
        Array.from(beadPlayground.sampleReference(32, 32)),
      ),
      originalSample,
    );
    await page.locator("#convert").click();
    await page.waitForFunction(() => !!beadPlayground.getCandidate());
    await page.locator("#enlargePreview").click();
    assert(await page.locator("#previewDialog").evaluate((d) => d.open));
    await page.locator("#closePreview").click();
    await setRange("saturation", 150);
    assert.equal(
      await page.evaluate(() => beadPlayground.getCandidate()),
      null,
    );
    assert.deepEqual(
      await page.evaluate(() => beadPlayground.getProject()),
      artworkBefore,
    );
    check(
      "Saturation reset, alpha, preview invalidation and enlarged preview preserve artwork",
    );

    const footerLinks = await page
      .locator(".site-legal a")
      .evaluateAll((a) => a.map((e) => ({ href: e.href, target: e.target })));
    assert.deepEqual(footerLinks, [
      { href: "https://www.brothforge.com/faq/copyright", target: "_top" },
      {
        href: "https://www.brothforge.com/faq/service-privacy",
        target: "_top",
      },
      {
        href: "https://www.brothforge.com/faq/policy.html#policy-q01",
        target: "_top",
      },
    ]);
    assert.equal(await page.locator(".site-legal .legal-item").count(), 4);
    await page.locator('[data-panel-tab="colors"]').click();
    await page.locator("#customColor").fill("#123456");
    await page.locator("#addColor").click();
    const currentURL = page.url();
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator(".site-legal a").first().click();
    assert.equal(page.url(), currentURL);
    check(
      "Four verified footer entries fit above safe area; cancel protects unsaved work before leaving",
    );
    const gift = page.locator(".site-feedback");
    assert.equal(
      await gift.getAttribute("href"),
      "https://www.brothforge.com/faq/feedback.html#feedback-q01",
    );
    assert.equal(await gift.getAttribute("target"), "_top");
    const beforeFeedback = await page.evaluate(() =>
      window.beadPlayground.getProject(),
    );
    page.once("dialog", (dialog) => dialog.dismiss());
    await gift.click();
    assert.equal(page.url(), currentURL);
    page.once("dialog", (dialog) => dialog.dismiss());
    await gift.focus();
    await page.keyboard.press("Enter");
    assert.equal(page.url(), currentURL);
    assert.deepEqual(
      await page.evaluate(() => window.beadPlayground.getProject()),
      beforeFeedback,
    );
    check(
      "Site feedback gift retains the official destination and cancel protects artwork for pointer and keyboard activation",
    );
    // Preserve pending legacy draft, then allow only explicitly confirmed replacement.
    const C = require("../src/core.cjs"),
      legacy = C.blank(8, 8, ["#abcdef"]);
    legacy.cells[3] = 0;
    const draftContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await draftContext.addInitScript(
      ({ legacy }) => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem("bead-playground-v1", JSON.stringify(legacy));
          sessionStorage.setItem("seeded", "1");
        }
      },
      { legacy },
    );
    const d = await draftContext.newPage();
    await d.goto(url);
    await d.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    await d.locator('[data-panel-tab="colors"]').click();
    await d.locator("#customColor").fill("#123456");
    await d.locator("#addColor").click();
    await d.waitForTimeout(650);
    const saved = await d.evaluate(() => ({
      legacy: JSON.parse(localStorage.getItem("bead-playground-v1")),
      current: localStorage.getItem("glintile:project:/preview/"),
    }));
    assert.deepEqual(saved.legacy, legacy);
    assert.equal(saved.current, null);
    const previousDownload = d.waitForEvent("download");
    await d.locator("#exportPrevious").click();
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(await (await previousDownload).path(), "utf8"),
      ),
      legacy,
    );
    await d.locator("#discard").click();
    await d.keyboard.press("Escape");
    assert(await d.locator("#restoreNotice").isVisible());
    await d.locator("#discard").click();
    await d.locator("#acceptStorageConfirm").click();
    assert.equal(await d.locator("#restoreNotice").isVisible(), false);
    const current = await d.evaluate(() => beadPlayground.getProject());
    assert.deepEqual(
      await d.evaluate(() =>
        JSON.parse(localStorage.getItem("glintile:project:/preview/")),
      ),
      current,
    );
    assert.deepEqual(
      await d.evaluate(() =>
        JSON.parse(localStorage.getItem("bead-playground-v1")),
      ),
      legacy,
    );
    await d.reload();
    await d.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    await d.locator("#restore").click();
    assert.deepEqual(
      await d.evaluate(() => beadPlayground.getProject()),
      current,
    );
    check(
      "Pending old draft cannot be silently overwritten; backup, cancel, confirm and restore work",
    );
    await draftContext.close();

    // Prepare a second revision without modifying any source files.
    const originalHTML = fs.readFileSync(
        path.join(built.web, "index.html"),
        "utf8",
      ),
      nextHTML = originalHTML.replace("</body>", "<!-- qa-v2 --></body>");
    let nextSW = fs
      .readFileSync(path.join(built.web, "sw.js"), "utf8")
      .replace(/const VERSION\s*=\s*['"][^'"]+['"]/, "const VERSION='qa-v2'");
    const list = JSON.parse(
      nextSW.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/)[1],
    );
    for (const item of list)
      if (item.url === "./" || item.url === "./index.html")
        item.integrity =
          "sha256-" +
          crypto.createHash("sha256").update(nextHTML).digest("base64");
    nextSW = nextSW.replace(
      /const PRECACHE\s*=\s*\[[\s\S]*?\];/,
      "const PRECACHE=" + JSON.stringify(list) + ";",
    );
    // A mixed deployment must fail installation without replacing the active cache.
    overrides.set("sw.js", nextSW.replace("qa-v2", "qa-broken"));
    const failedState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
      const worker = reg.installing;
      if (!worker) return "no-installing";
      return await new Promise((resolve) => {
        const changed = () => {
          if (["redundant", "installed"].includes(worker.state))
            resolve(worker.state);
        };
        worker.addEventListener("statechange", changed);
        changed();
      });
    });
    assert.equal(failedState, "redundant");
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    assert.equal((await page.content()).includes("qa-v2"), false);
    await context.setOffline(false);
    check(
      "Integrity mismatch rejects partial update and retains working offline revision",
    );
    overrides.set("index.html", nextHTML);
    overrides.set("sw.js", nextSW);
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
    );
    const other = await context.newPage();
    await other.goto(url);
    assert.equal((await other.content()).includes("qa-v2"), false);
    await other.close();
    assert.equal((await page.content()).includes("qa-v2"), false);
    await page.locator('[data-panel-tab="export"]').click();
    await page.locator(".pwa-panel").evaluate((n) => (n.open = true));
    await page.waitForFunction(
      () => !document.getElementById("updateApp").hidden,
    );
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#updateApp").click();
    assert.equal((await page.content()).includes("qa-v2"), false);
    check(
      "Waiting update and reopening keep active version; cancel never reloads",
    );
    const storedBefore = await page.evaluate(() =>
      localStorage.getItem("glintile:project:/preview/"),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#updateApp").click();
    await page.waitForFunction(() =>
      document.documentElement.outerHTML.includes("qa-v2"),
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("glintile:project:/preview/"),
      ),
      storedBefore,
    );
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    assert((await page.content()).includes("qa-v2"));
    check(
      "Confirmed update installs complete revision, preserves stored project and reloads offline",
    );
    assert.equal(report.errors.length, 0);
    assert.equal(report.externalRequests.length, 0);
    check("No runtime errors or third-party requests");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "artifacts/browser-results.json"),
      JSON.stringify(report, null, 2),
    );
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
