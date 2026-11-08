const assert = require("node:assert/strict");
module.exports = async function headerNoticeCoverage(browser, url, check) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await context.addInitScript(() => {
      localStorage.setItem(
        "bead-playground-v1",
        JSON.stringify({
          format: "bead-playground",
          version: 1,
          width: 8,
          height: 8,
          palette: ["#abcdef"],
          cells: Array(64).fill(-1),
          settings: { shape: "circle", background: "#000000", exportCell: 12 },
        }),
      );
    });
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    await page.waitForFunction(() => {
      const logo = document.querySelector(".brand-icon");
      return logo?.complete && logo.naturalWidth === 192;
    });
    for (const [width, height] of [
      [320, 640],
      [390, 844],
      [430, 932],
      [768, 1024],
      [844, 390],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      const layout = await page.evaluate(() => {
        const text = document.querySelector("#restoreNotice > span"),
          t = text.getBoundingClientRect();
        const actions = [
          ...document.querySelectorAll("#restoreNotice button"),
        ].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            scrollWidth: b.scrollWidth,
            clientWidth: b.clientWidth,
          };
        });
        const brand = document.querySelector(".brand").getBoundingClientRect();
        const logo = document.querySelector(".brand-icon"),
          l = logo.getBoundingClientRect(),
          name = document.querySelector(".brand-line").getBoundingClientRect();
        const chinese = document.querySelector(".chinese-name"),
          zh = chinese.getBoundingClientRect(),
          en = document
            .querySelector(".brand-wordmark")
            .getBoundingClientRect(),
          header = document.querySelector("header").getBoundingClientRect();
        const headerButtons = [
          ...document.querySelectorAll(".header-tools button, .header-tools a"),
        ].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            left: r.left,
            right: r.right,
            width: r.width,
            height: r.height,
            text: b.textContent.trim(),
            label: b.getAttribute("aria-label"),
            icons: b.querySelectorAll("svg").length,
          };
        });
        return {
          textTop: t.top,
          textBottom: t.bottom,
          textHeight: t.height,
          lineHeight: parseFloat(getComputedStyle(text).lineHeight),
          actions,
          headerButtons,
          brandRight: brand.right,
          brandLabel: document
            .querySelector(".brand")
            .getAttribute("aria-label"),
          lettering: {
            top: en.top,
            bottom: zh.bottom,
            headerTop: header.top,
            headerBottom: header.bottom,
            width: zh.width,
            englishWidth: en.width,
            glyphs: chinese.querySelectorAll("[data-character]").length,
            stroke:
              (parseFloat(getComputedStyle(chinese).strokeWidth) * zh.width) /
              136,
          },
          logo: {
            width: l.width,
            height: l.height,
            right: l.right,
            nameLeft: name.left,
            naturalWidth: logo.naturalWidth,
          },
          headerText: document.querySelector("header").innerText,
          scrollWidth: document.documentElement.scrollWidth,
        };
      });
      assert(
        layout.textHeight <= layout.lineHeight * 2 + 1,
        width + "px notice should use at most two text lines",
      );
      assert(
        layout.actions.every(
          (a) =>
            a.top >= layout.textBottom + 4 &&
            a.height >= 44 &&
            a.scrollWidth <= a.clientWidth,
        ),
      );
      assert(
        layout.actions.every(
          (a) =>
            Math.abs(a.top - layout.actions[0].top) < 1 &&
            Math.abs(a.bottom - layout.actions[0].bottom) < 1,
        ),
      );
      assert.equal(layout.headerButtons.length, 3);
      assert(
        layout.headerButtons.every(
          (b) =>
            !b.text &&
            b.label &&
            b.icons === 1 &&
            b.width >= 44 &&
            b.height >= 44,
        ),
      );
      assert(layout.brandRight < layout.headerButtons[0].left);
      assert(layout.headerButtons[2].right <= width);
      assert(!layout.headerText.includes("试作"));
      assert(!layout.headerText.includes("一颗一颗"));
      assert(layout.brandLabel.includes("Glintile"));
      assert(layout.brandLabel.includes("点灯匣"));
      assert.equal(layout.lettering.glyphs, 3);
      assert.equal(layout.lettering.width, layout.lettering.englishWidth);
      assert(layout.lettering.stroke >= 1.2);
      assert(layout.lettering.top > layout.lettering.headerTop);
      assert(layout.lettering.bottom < layout.lettering.headerBottom);
      assert(layout.logo.width >= 44 && layout.logo.height >= 44);
      assert.equal(layout.logo.naturalWidth, 192);
      assert(layout.logo.right < layout.logo.nameLeft);
      assert(layout.scrollWidth <= width);
    }
    await page.locator("#headerExport").click();
    assert(await page.locator("#mobileJson").isVisible());
    assert.equal(await page.locator("#restoreNotice").isVisible(), true);
    check(
      "Restore notice keeps two text lines above one accessible button row across six sizes",
    );
    check(
      "Compact header shows the real PWA logo, bilingual wordmark and three accessible icon actions",
    );
  } finally {
    await context.close();
  }
};
