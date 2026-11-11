const assert = require("node:assert/strict");
module.exports = async function shareCoverage(browser, url, check) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    await context.addInitScript(() => {
      window.shared = [];
      window.copied = [];
      window.shareBehavior = "pending";
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data) => {
          window.shared.push(data);
          if (window.shareBehavior === "cancel")
            throw new DOMException("Canceled", "AbortError");
          if (window.shareBehavior === "fail")
            throw new DOMException("Unavailable", "NotAllowedError");
          if (window.shareBehavior === "pending")
            await new Promise((resolve) => {
              window.finishShare = resolve;
            });
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            if (window.copyFails) throw new Error("Clipboard unavailable");
            window.copied.push(text);
          },
        },
      });
    });
    const page = await context.newPage();
    await page.goto(url + "?private=do-not-share#draft");
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    const project = await page.evaluate(() => beadPlayground.getProject());
    await page.locator("#headerShare").click();
    assert(await page.locator("#headerShare").isDisabled());
    await page.locator("#headerShare").evaluate((b) => b.click());
    assert.equal(await page.evaluate(() => window.shared.length), 1);
    assert.deepEqual(await page.evaluate(() => window.shared[0]), {
      title: "Glintile · 点灯匣",
      url: "https://glintile.game.brothforge.com/",
    });
    await page.evaluate(() => window.finishShare());
    await page.waitForFunction(
      () => !document.getElementById("headerShare").disabled,
    );
    await page.evaluate(() => {
      window.shareBehavior = "cancel";
    });
    await page.locator("#headerShare").click();
    assert.equal(
      await page.locator("#shareDialog").evaluate((d) => d.open),
      false,
    );
    assert.equal(await page.evaluate(() => window.copied.length), 0);
    await page.evaluate(() => {
      window.shareBehavior = "fail";
    });
    await page.locator("#headerShare").click();
    assert(await page.locator("#shareDialog").evaluate((d) => d.open));
    assert.equal(
      await page.locator("#shareUrl").inputValue(),
      "https://glintile.game.brothforge.com/",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#shareDialog").evaluate((d) => d.open),
      false,
    );
    await page.waitForFunction(
      () => document.activeElement.id === "headerShare",
    );
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { value: undefined });
    });
    await page.locator("#headerShare").click();
    assert.deepEqual(await page.evaluate(() => window.copied), [
      "https://glintile.game.brothforge.com/",
    ]);
    await page.evaluate(() => {
      window.copyFails = true;
    });
    await page.locator("#headerShare").click();
    assert(await page.locator("#shareDialog").evaluate((d) => d.open));
    await page.locator("#closeShare").click();
    assert.equal(
      await page.locator("#shareDialog").evaluate((d) => d.open),
      false,
    );
    assert.deepEqual(
      await page.evaluate(() => beadPlayground.getProject()),
      project,
    );
    check(
      "Sharing sends only the official webpage URL and preserves artwork on success or cancellation",
    );
    check(
      "Share fallback, repeated activation and dismissal remain usable without native APIs",
    );
  } finally {
    await context.close();
  }
};
