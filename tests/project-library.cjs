const assert = require("node:assert/strict");
const C = require("../src/core.cjs");

module.exports = async function projectLibrary(browser, url, check) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 650 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    const page = await context.newPage();
    const button = (id) => page.locator("#" + id);
    const project = () => page.evaluate(() => beadPlayground.getProject());
    const action = (name, slot) =>
      page.locator('[data-action="' + name + '"][data-slot="' + slot + '"]');
    const focused = () => page.evaluate(() => document.activeElement.id);
    const openExport = (target) =>
      target.locator('[data-panel-tab="export"]').click();
    const key = "glintile:works:v1:" + new URL(url).pathname + ":0";
    const settings = { shape: "circle", background: "#000000", exportCell: 12 };
    const first = { ...C.blank(8, 8, ["#123456"]), settings };
    first.cells[3] = 0;

    await page.goto(url);
    await openExport(page);
    const original = await project();
    await button("restoreProjectData").click();
    await button("projectDataText").fill("{");
    await button("applyProjectData").click();
    await button("projectDataFeedback").waitFor({ state: "visible" });
    assert.match(await button("projectDataFeedback").innerText(), /JSON/);
    assert.deepEqual(await project(), original);
    await button("projectDataText").fill(JSON.stringify(first));
    await button("applyProjectData").click();
    assert.equal(await focused(), "cancelStorageConfirm");
    await page.keyboard.press("Escape");
    assert.equal(await focused(), "applyProjectData");
    assert.deepEqual(await project(), original);
    await button("applyProjectData").click();
    await button("acceptStorageConfirm").click();
    await button("projectDataDialog").waitFor({ state: "hidden" });
    assert.deepEqual(await project(), first);
    assert.equal(await focused(), "restoreProjectData");

    await button("openSaved").click();
    await button("saveNewWork").click();
    await button("workName").fill("第一幅");
    await button("workName").press("Enter");
    const title = action("rename", 0);
    await title.waitFor();
    assert.equal(await title.innerText(), "第一幅");
    assert.equal(await title.getAttribute("aria-label"), "重命名“第一幅”");
    assert.equal(
      await title.evaluate(
        (node) => getComputedStyle(node).textDecorationStyle,
      ),
      "dotted",
    );
    const verifyActionRow = async () => {
      const buttons = await page
        .locator("#savedList li")
        .first()
        .locator(".saved-actions button")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return {
              action: node.dataset.action,
              x,
              y,
              width,
              height,
              path: node.querySelector("path")?.getAttribute("d"),
            };
          }),
        );
      assert.deepEqual(
        buttons.map((button) => button.action),
        ["open", "copy", "remove", "overwrite"],
      );
      assert.deepEqual(
        buttons.slice(0, 3).map((button) => button.path),
        [
          "M4 16l-1 5 5-1L20 8l-4-4L4 16zM14 6l4 4",
          "M8 8h12v12H8zM16 8V4H4v12h4",
          "M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M9 10v7M15 10v7",
        ],
      );
      assert(
        buttons.every(
          (button) => button.y === buttons[0].y && button.height >= 44,
        ),
      );
      assert(buttons.slice(0, 3).every((button) => button.width === 44));
      assert(buttons[3].x + buttons[3].width <= page.viewportSize().width);
    };
    await verifyActionRow();
    await title.press("Enter");
    await button("workName").waitFor();
    assert.equal(await button("workNameCount").innerText(), "3 / 30");
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.dataset.action === "rename",
    );

    await button("pasteFromLibrary").click();
    assert.equal(await button("closeProjectData").innerText(), "返回我的作品");
    await button("closeProjectData").click();
    assert.equal(await focused(), "pasteFromLibrary");
    await action("copy", 0).click();
    assert.equal(await button("closeProjectData").innerText(), "返回我的作品");
    await button("copyProjectData").click();
    await button("projectDataFeedback").waitFor({ state: "visible" });
    assert.deepEqual(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
      first,
    );
    await button("closeProjectData").click();
    assert(
      await action("copy", 0).evaluate(
        (node) => node === document.activeElement,
      ),
    );
    await button("closeSaved").click();

    // Clipboard permissions can be unavailable. Select the complete text for manual copying.
    await page.evaluate(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException("Denied", "NotAllowedError"));
    });
    await button("copyCurrentData").click();
    await button("copyProjectData").click();
    await button("projectDataFeedback").waitFor({ state: "visible" });
    assert(
      await button("projectDataText").evaluate(
        (node) =>
          node.selectionStart === 0 && node.selectionEnd === node.value.length,
      ),
    );
    await page.keyboard.press("Escape");

    const second = { ...C.blank(9, 8, ["#654321"]), settings };
    await button("projectInput").setInputFiles({
      name: "second.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(second)),
    });
    await page.waitForFunction(() => beadPlayground.getProject().width === 9);
    await button("openSaved").click();
    await button("saveNewWork").click();
    await button("workName").fill("第二幅");
    await button("workName").press("Enter");
    await action("open", 1).waitFor();
    assert.equal(await page.locator("#savedList li").count(), 2);
    await action("open", 0).click();
    assert.deepEqual(await project(), first);
    await button("openSaved").click();
    await action("open", 1).click();
    assert.deepEqual(await project(), second);

    await button("openSaved").click();
    await action("overwrite", 0).click();
    assert.equal(await focused(), "cancelStorageConfirm");
    const other = await context.newPage();
    await other.goto(url);
    await openExport(other);
    await other.locator("#openSaved").click();
    await other.locator('[data-action="rename"][data-slot="0"]').click();
    await other.locator("#workName").fill("另一页改名");
    await other.locator("#workName").press("Enter");
    await other.getByText("另一页改名", { exact: true }).waitFor();
    const readRecord = () =>
      page.evaluate((key) => localStorage.getItem(key), key);
    const changed = await readRecord();
    await button("acceptStorageConfirm").evaluate((node) => {
      node.click();
      node.click();
    });
    await page.getByText(/存档已在其他页面变化/).waitFor();
    assert.equal(await readRecord(), changed);
    await other.close();

    await action("overwrite", 0).click();
    await button("acceptStorageConfirm").click();
    await page.getByText(/已覆盖/).waitFor();
    const updated = JSON.parse(await readRecord());
    assert.equal(updated.name, "另一页改名");
    assert.deepEqual(JSON.parse(updated.data), second);

    for (const viewport of [
      { width: 320, height: 650 },
      { width: 720, height: 300 },
    ]) {
      await page.setViewportSize(viewport);
      await verifyActionRow();
      await action("remove", 0).click();
      assert.equal(await focused(), "cancelStorageConfirm");
      for (const id of [
        "storageConfirmDialog",
        "cancelStorageConfirm",
        "acceptStorageConfirm",
      ]) {
        const bounds = await button(id).boundingBox();
        assert(
          bounds &&
            bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= viewport.width &&
            bounds.y + bounds.height <= viewport.height,
          id + " fits within " + JSON.stringify(viewport),
        );
      }
      await page.keyboard.press("Escape");
      assert(
        await action("remove", 0).evaluate(
          (node) => node === document.activeElement,
        ),
      );
      assert(await readRecord());
    }

    await action("remove", 0).click();
    await button("acceptStorageConfirm").click();
    await action("remove", 0).waitFor({ state: "detached" });
    assert.equal(await focused(), "closeSaved");
    assert.equal(await readRecord(), null);
    assert.deepEqual(await project(), second);
    await page.reload();
    await openExport(page);
    await button("openSaved").click();
    assert.equal(await page.locator("#savedList li").count(), 1);
    assert(await page.getByText("第二幅", { exact: true }).isVisible());
    await page.locator("#closeSaved").click();
    await page.evaluate(
      (key) => {
        const record = JSON.parse(localStorage.getItem(key));
        record.savedAt = { toString: null, valueOf: null };
        localStorage.setItem(key, JSON.stringify(record));
      },
      key.slice(0, -1) + "1",
    );
    await button("openSaved").click();
    await page.getByText("保存时间未知", { exact: true }).waitFor();
    assert(await action("open", 1).isEnabled());
    check(
      "Project library, clipboard and JSON transfer preserve work across dialogs and reloads",
    );
    check(
      "Confirmations retain keyboard focus and reject repeated or stale destructive actions",
    );
  } finally {
    await context.close();
  }
};
