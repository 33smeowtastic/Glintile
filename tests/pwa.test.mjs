import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("late first-install success replaces timeout state without reload", async () => {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id))
      nodes.set(id, { hidden: false, disabled: false, textContent: "" });
    return nodes.get(id);
  };
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const registration = { active: null, waiting: null, addEventListener() {} };
  const worker = {
    controller: null,
    ready,
    register: async () => registration,
    addEventListener() {},
  };
  let reloaded = false;
  const context = {
    document: { getElementById: node },
    navigator: { serviceWorker: worker, onLine: true },
    window: { addEventListener() {} },
    matchMedia: () => ({ matches: false }),
    isSecureContext: true,
    location: {
      reload: () => {
        reloaded = true;
      },
    },
    confirm: () => false,
    setTimeout: (fn) => {
      queueMicrotask(fn);
      return 1;
    },
    Promise,
  };
  vm.runInNewContext(
    fs.readFileSync(new URL("../pwa/install.js", import.meta.url), "utf8"),
    context,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(node("offlineStatus").textContent, /暂未准备好/);
  registration.active = {};
  worker.controller = {};
  resolveReady(registration);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(node("offlineStatus").textContent, /离线已准备好/);
  assert.equal(node("retryOffline").hidden, true);
  assert.equal(reloaded, false);
});
