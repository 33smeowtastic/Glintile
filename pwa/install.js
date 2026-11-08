(function () {
  "use strict";
  const status = document.getElementById("offlineStatus"),
    install = document.getElementById("installApp"),
    update = document.getElementById("updateApp"),
    retry = document.getElementById("retryOffline");
  let deferredPrompt = null,
    registration = null,
    reloadApproved = false,
    registering = false;
  const show = (s) => {
    status.textContent = s;
  };
  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  if (standalone())
    document.getElementById("installHelp").textContent =
      "已在独立应用窗口中打开。作品仍保存在此浏览器，记得导出JSON备份。";
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    install.hidden = standalone();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    install.hidden = true;
    document.getElementById("installHelp").textContent =
      "已添加到设备。请保存JSON备份，卸载或清理浏览器可能移除暂存。";
  });
  install.onclick = async () => {
    if (!deferredPrompt) return;
    install.disabled = true;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      show("暂未完成安装，可用浏览器菜单重试。");
    } finally {
      install.hidden = true;
      install.disabled = false;
    }
  };
  const available = () => {
    if (registration?.waiting) {
      update.hidden = false;
      show("新版本已准备好。当前作品不会自动刷新，请先保存JSON。");
    }
  };
  update.onclick = () => {
    if (!registration?.waiting) return;
    if (
      !confirm(
        "更新会刷新页面。请先保存JSON备份；参考图需要重新选择。现在更新吗？",
      )
    )
      return;
    reloadApproved = true;
    update.disabled = true;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  };
  function readyState() {
    if (registration?.waiting) {
      available();
      return;
    }
    if (navigator.serviceWorker?.controller || registration?.active) {
      retry.hidden = true;
      update.hidden = true;
      update.disabled = false;
      show(
        navigator.onLine
          ? "离线已准备好。断网后仍可打开、编辑和导出。"
          : "当前离线，编辑与导出可用。",
      );
    }
  }
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloadApproved) location.reload();
    else readyState();
  });
  async function register() {
    if (registering) return;
    registering = true;
    retry.hidden = true;
    if (!("serviceWorker" in navigator) || !isSecureContext) {
      show(
        "此环境不支持离线安装。请用HTTPS网址或localhost打开；编辑和导出仍可使用。",
      );
      registering = false;
      return;
    }
    try {
      registration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
      available();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") available();
        });
      });
      navigator.serviceWorker.ready.then(readyState).catch(() => {});
      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error("timeout")), 15000),
        ),
      ]);
      if (ready.active && !registration.waiting)
        show(
          navigator.onLine
            ? "离线已准备好。断网后仍可打开、编辑和导出。"
            : "当前离线，编辑与导出可用。",
        );
      available();
    } catch {
      show("离线资源暂未准备好，编辑仍可使用。联网后可重试。");
      retry.hidden = false;
    } finally {
      registering = false;
    }
  }
  retry.onclick = register;
  window.addEventListener("offline", () => {
    if (navigator.serviceWorker?.controller && !registration?.waiting)
      show("当前离线，编辑与导出可用。");
  });
  window.addEventListener("online", () => {
    if (navigator.serviceWorker?.controller && !registration?.waiting)
      show("离线已准备好。图片仍只在设备上处理。");
  });
  register();
})();
