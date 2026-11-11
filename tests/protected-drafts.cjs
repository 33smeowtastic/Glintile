const assert = require("node:assert/strict");
const fs = require("node:fs");
const C = require("../src/core.cjs");

module.exports = async function protectedDraftCoverage(browser, url, check) {
  const scoped = "glintile:project:" + new URL(url).pathname,
    legacyKey = "bead-playground-v1",
    legacy = JSON.stringify(C.blank(8, 8, ["#abcdef"])),
    future =
      JSON.stringify(
        { ...C.blank(8, 8), version: 2, note: "保留原样" },
        null,
        2,
      ) + "\n";
  const fixtures = [
    ["future", future, scoped],
    ["malformed", '{ "format": "bead-playground", "unfinished": ', scoped],
    ["empty", "", scoped],
    [
      "invalid-schema",
      '{"format":"bead-playground","version":1,"width":0}',
      scoped,
    ],
    ["legacy-future", future, legacyKey],
  ];
  for (const [name, raw, key] of fixtures) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    try {
      await context.addInitScript(
        ({ raw, key, legacyKey, legacy }) => {
          if (!sessionStorage.getItem("synthetic-seeded")) {
            localStorage.setItem(legacyKey, legacy);
            localStorage.setItem(key, raw);
            sessionStorage.setItem("synthetic-seeded", "1");
          }
        },
        { raw, key, legacyKey, legacy },
      );
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(
        () => window.beadPlayground?.getDiagnostics().referenceLoaded,
      );
      const readRaw = () => page.evaluate((k) => localStorage.getItem(k), key);
      await page.locator("#headerExport").click();
      const currentDownload = page.waitForEvent("download");
      await page.locator("#mobileJson").click();
      await currentDownload;
      assert.equal(
        await readRaw(),
        raw,
        name + ": exporting current artwork must preserve original storage",
      );
      assert(await page.locator("#restoreNotice").isVisible());
      assert(await page.locator("#restore").isDisabled());
      const backupDownload = page.waitForEvent("download");
      await page.locator("#exportPrevious").click();
      assert.equal(
        fs.readFileSync(await (await backupDownload).path(), "utf8"),
        raw,
        name + ": backup preserves every original character",
      );
      await page.locator('[data-panel-tab="colors"]').click();
      await page.locator("#customColor").fill("#123456");
      await page.locator("#addColor").click();
      await page.waitForTimeout(650);
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      assert.equal(
        await readRaw(),
        raw,
        name + ": autosave and pagehide must preserve original storage",
      );
      await page.reload();
      await page.waitForFunction(
        () => window.beadPlayground?.getDiagnostics().referenceLoaded,
      );
      assert.equal(await readRaw(), raw);
      await page.locator("#discard").click();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "cancelStorageConfirm",
      );
      await page.keyboard.press("Escape");
      assert.equal(await readRaw(), raw);
      await page.locator("#projectInput").setInputFiles({
        name: "synthetic.json",
        mimeType: "application/json",
        buffer: Buffer.from(legacy),
      });
      await page.locator("#cancelStorageConfirm").click();
      await page.waitForTimeout(650);
      assert.equal(
        await readRaw(),
        raw,
        name + ": cancelled import preserves original storage",
      );
      assert(await page.locator("#restoreNotice").isVisible());
      if (name === "future") {
        await page.locator("#discard").click();
        await page.evaluate(
          ({ scoped, legacy }) => localStorage.setItem(scoped, legacy),
          { scoped, legacy },
        );
        await page.locator("#acceptStorageConfirm").click();
        await page.getByText(/本次未替换/).waitFor();
        assert.equal(
          await readRaw(),
          legacy,
          "a stale confirmation must preserve a newer draft",
        );
        assert(await page.locator("#restoreNotice").isVisible());
        await page.evaluate(
          ({ scoped, raw }) => localStorage.setItem(scoped, raw),
          { scoped, raw },
        );
      }
      await page.locator("#discard").click();
      await page.locator("#acceptStorageConfirm").click();
      assert.equal(await page.locator("#restoreNotice").isVisible(), false);
      const saved = await page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)),
        scoped,
      );
      assert.deepEqual(
        saved,
        await page.evaluate(() => window.beadPlayground.getProject()),
      );
      assert.equal(
        await page.evaluate((k) => localStorage.getItem(k), legacyKey),
        key === legacyKey ? raw : legacy,
      );
    } finally {
      await context.close();
    }
  }
  check(
    "Unknown, malformed, empty and legacy drafts retain exact backups until confirmed replacement",
  );

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  try {
    await context.addInitScript(
      ({ scoped, future }) => {
        localStorage.setItem(scoped, future);
        const read = Storage.prototype.getItem;
        window.readSyntheticStoredDraft = () => read.call(localStorage, scoped);
        Storage.prototype.getItem = function (key) {
          if (this === localStorage && key === scoped)
            throw new DOMException("Synthetic read failure", "SecurityError");
          return read.call(this, key);
        };
      },
      { scoped, future },
    );
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(
      () => window.beadPlayground?.getDiagnostics().referenceLoaded,
    );
    await page.locator("#headerExport").click();
    const download = page.waitForEvent("download");
    await page.locator("#mobileJson").click();
    await download;
    assert.equal(
      await page.evaluate(() => window.readSyntheticStoredDraft()),
      future,
    );
    assert.match(await page.locator("#saveStatus").innerText(), /无法读取/);
    check("Unreadable storage cannot be overwritten by export or later writes");
  } finally {
    await context.close();
  }

  const quotaContext = await browser.newContext();
  try {
    await quotaContext.addInitScript(
      ({ scoped, legacyKey, legacy }) => {
        localStorage.setItem(legacyKey, legacy);
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (this === localStorage && key === scoped)
            throw new DOMException(
              "Synthetic storage limit",
              "QuotaExceededError",
            );
          return write.call(this, key, value);
        };
      },
      { scoped, legacyKey, legacy },
    );
    const page = await quotaContext.newPage();
    await page.goto(url);
    await page.locator("#restore").click();
    assert.deepEqual(
      await page.evaluate(() => beadPlayground.getProject()),
      JSON.parse(legacy),
    );
    await page.waitForFunction(() =>
      document.querySelector("#saveStatus").textContent.includes("暂存不可用"),
    );
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), legacyKey),
      legacy,
    );
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), scoped),
      null,
    );
    check(
      "Readable legacy draft opens even when the browser rejects autosave writes",
    );
  } finally {
    await quotaContext.close();
  }
};
