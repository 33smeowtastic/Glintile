(function () {
  "use strict";
  document.addEventListener("click", (event) => {
    const link = event.target.closest(".site-legal a, .site-feedback");
    if (
      !link ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (
      window.beadPlayground?.getDiagnostics().unsaved &&
      !window.confirm(
        "离开点灯匣？当前作品有未保存为JSON的改动。取消后可先保存；参考图不会随暂存保留。",
      )
    )
      event.preventDefault();
  });
})();
