const assert = require("node:assert/strict");

module.exports = async function referenceCoverage(browser, url, check) {
  const layouts = [
    [320, 640],
    [390, 844],
    [430, 932],
    [768, 1024],
    [844, 390],
    [1440, 900],
  ];
  for (const [width, height] of layouts) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: width < 900,
      hasTouch: width < 900,
    });
    try {
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(
        () => window.beadPlayground?.getDiagnostics().referenceLoaded,
      );
      const range = async (id, value) => {
        await page.locator("#" + id).fill(String(value));
        await page.locator("#" + id).dispatchEvent("input");
      };
      const geometry = () =>
        page.evaluate(() => {
          const r = document
            .getElementById("referenceView")
            .getBoundingClientRect();
          const v = beadPlayground.getReferenceView();
          const aspect =
            Number(document.getElementById("gridWidth").value) /
            Number(document.getElementById("gridHeight").value);
          const fw = Math.min(r.width - 20, (r.height - 20) * aspect),
            fh = fw / aspect;
          // Both bundled source images are square; neither source is changed by browsing.
          const imageSize =
            (Math.min(fw, fh) *
              Number(document.getElementById("refScale").value)) /
            100;
          const imageX =
            (fw - imageSize) / 2 +
            (fw * Number(document.getElementById("refX").value)) / 100;
          const imageY =
            (fh - imageSize) / 2 +
            (fh * Number(document.getElementById("refY").value)) / 100;
          const left = r.width / 2 + v.x * r.width - (fw * v.scale) / 2;
          const top = r.height / 2 + v.y * r.height - (fh * v.scale) / 2;
          const c = document.getElementById("referenceView"),
            data = c
              .getContext("2d")
              .getImageData(0, 0, c.width, c.height).data;
          let brightOutsideFrame = 0;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++) {
              const outside =
                x < left - 2 ||
                x > left + fw * v.scale + 2 ||
                y < top - 2 ||
                y > top + fh * v.scale + 2;
              const i = (y * c.width + x) * 4;
              if (outside && Math.max(data[i], data[i + 1], data[i + 2]) > 140)
                brightOutsideFrame++;
            }
          return {
            width: r.width,
            height: r.height,
            brightOutsideFrame,
            image: {
              left: left + imageX * v.scale,
              top: top + imageY * v.scale,
              right: left + (imageX + imageSize) * v.scale,
              bottom: top + (imageY + imageSize) * v.scale,
            },
            frame: {
              left,
              top,
              right: left + fw * v.scale,
              bottom: top + fh * v.scale,
            },
          };
        });
      for (const example of ["cat", "bone"]) {
        await page.locator('[data-panel-tab="convert"]').click();
        await page.locator(`[data-example="${example}"]`).click();
        await page.waitForFunction(
          (name) =>
            document.getElementById("imageName").textContent.startsWith(name),
          example === "cat" ? "黑猫" : "骨头",
        );
        const project = await page.evaluate(() => beadPlayground.getProject());
        for (const mode of ["side", "horizontal"]) {
          await page.locator("#viewMode").selectOption(mode);
          await page.locator('[data-panel-tab="reference"]').click();
          await range("refScale", 200);
          await range("refX", 20);
          await range("refY", -10);
          const cropSample = await page.evaluate(() =>
            Array.from(beadPlayground.sampleReference(12, 12)),
          );
          await page.locator("#refFit").click();
          const fit = await geometry();
          for (const rect of [fit.image, fit.frame]) {
            assert(
              rect.left >= 9 &&
                rect.top >= 9 &&
                rect.right <= fit.width - 9 &&
                rect.bottom <= fit.height - 9,
              `${example} ${mode} ${width}x${height}: full-image fit must include the source and crop outline: ${JSON.stringify(fit)}`,
            );
          }
          assert(
            fit.brightOutsideFrame > 25,
            `${example} ${mode} ${width}x${height}: source pixels outside the crop outline must remain visible`,
          );
          assert.deepEqual(
            await page.evaluate(() => beadPlayground.getProject()),
            project,
          );
          assert.deepEqual(
            await page.evaluate(() =>
              Array.from(beadPlayground.sampleReference(12, 12)),
            ),
            cropSample,
          );
          assert.equal(await page.locator("#refScale").inputValue(), "200");
          assert.equal(await page.locator("#refX").inputValue(), "20");
          assert.equal(await page.locator("#refY").inputValue(), "-10");
          await page.locator("#refZoomIn").click();
          await page.locator("#referenceView").press("ArrowLeft");
          const manual = await page.evaluate(() => {
            const { scale, x, y } = beadPlayground.getReferenceView();
            return { scale, x, y };
          });
          await page
            .locator("#viewMode")
            .selectOption(mode === "side" ? "horizontal" : "side");
          assert.deepEqual(
            await page.evaluate(() => {
              const { scale, x, y } = beadPlayground.getReferenceView();
              return { scale, x, y };
            }),
            manual,
          );
        }
        for (const mode of ["side", "horizontal", "trace", "free"]) {
          await page.locator("#viewMode").selectOption(mode);
          assert.equal(
            await page.locator("#referencePanel").isVisible(),
            ["side", "horizontal"].includes(mode),
          );
          await page.locator("#fit").click();
          const content = await page.evaluate(() => {
            const p = beadPlayground.getProject(),
              v = beadPlayground.getView();
            const cells = p.cells
              .map((color, i) =>
                color >= 0
                  ? { x: i % p.width, y: Math.floor(i / p.width) }
                  : null,
              )
              .filter(Boolean);
            return {
              left: v.x + Math.min(...cells.map((p) => p.x)) * v.scale,
              top: v.y + Math.min(...cells.map((p) => p.y)) * v.scale,
              right: v.x + (Math.max(...cells.map((p) => p.x)) + 1) * v.scale,
              bottom: v.y + (Math.max(...cells.map((p) => p.y)) + 1) * v.scale,
              width: v.width,
              height: v.height,
            };
          });
          assert(
            content.left >= 0 &&
              content.top >= 0 &&
              content.right <= content.width &&
              content.bottom <= content.height,
          );
          assert.deepEqual(
            await page.evaluate(() => beadPlayground.getProject()),
            project,
          );
        }
      }
    } finally {
      await context.close();
    }
  }
  check(
    "Both built-in references remain complete across six screen sizes and all four modes",
  );
  check(
    "Reference full-image fit and browsing preserve crop, conversion sampling and artwork",
  );
};
