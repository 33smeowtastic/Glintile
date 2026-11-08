(function () {
  "use strict";
  const C = globalThis.BeadCore,
    $ = (id) => document.getElementById(id),
    canvas = $("viewport"),
    ctx = canvas.getContext("2d"),
    stage = $("stage"),
    refCanvas = $("referenceView"),
    refCtx = refCanvas.getContext("2d"),
    art = document.createElement("canvas"),
    artCtx = art.getContext("2d");
  const EXAMPLES = JSON.parse($("example-data")?.textContent || "[]");
  const STORAGE = "glintile:project:" + new URL(".", location.href).pathname,
    LEGACY_STORAGE = "bead-playground-v1",
    HISTORY = 100,
    MOBILE = true;
  let project = EXAMPLES.find((e) => e.id === "cat")
      ? C.clone(EXAMPLES.find((e) => e.id === "cat").project)
      : C.blank(64, 64),
    candidate = null,
    reference = null,
    refUrl = null,
    tool = "paint",
    selected = 0,
    history = [],
    future = [],
    stroke = null,
    pointers = new Map(),
    gesture = null,
    view = { scale: 1, x: 0, y: 0 },
    width = 0,
    height = 0,
    space = false,
    hover = null,
    raf = 0,
    saveTimer = 0,
    toastTimer = 0,
    importSerial = 0,
    imageSerial = 0,
    cache = null,
    pendingStoredRaw = null,
    storageReadBlocked = false,
    storageOK = true,
    dirty = false,
    pageScroll = false,
    savedFingerprint = null,
    conversionSerial = 0;
  function notify(text, error = false) {
    $("toast").textContent = text;
    $("toast").className = "toast visible" + (error ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").className = "toast"), 6000);
  }
  function assert(ok, msg) {
    if (!ok) throw Error(msg);
  }
  function setSettings() {
    project.settings = {
      shape: $("shape").value,
      background: $("background").value,
      exportCell: Number($("exportCell").value),
    };
  }
  function snapshot() {
    return C.clone(project);
  }
  function count() {
    return project.cells.reduce((n, v) => n + (v >= 0), 0);
  }
  function saveLocal() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (storageReadBlocked) {
      $("saveStatus").textContent = "无法读取本机暂存 · 当前作品请保存 JSON";
      return;
    }
    if (pendingStoredRaw !== null) {
      $("saveStatus").textContent = "上次暂存已保留 · 当前改动请保存 JSON";
      return;
    }
    try {
      localStorage.setItem(STORAGE, JSON.stringify(project));
      storageOK = true;
      dirty = false;
      $("saveStatus").textContent = "已本机暂存 · 建议保存 JSON";
    } catch (e) {
      storageOK = false;
      $("saveStatus").textContent = "暂存不可用 · 请保存 JSON";
    }
  }
  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveLocal, 500);
  }
  function pushBefore(before) {
    if (JSON.stringify(before) === JSON.stringify(project)) return false;
    history.push(before);
    if (history.length > HISTORY) history.shift();
    future = [];
    scheduleSave();
    return true;
  }
  function hasUnsavedEdits() {
    return (
      savedFingerprint === null || JSON.stringify(project) !== savedFingerprint
    );
  }
  function clearPointerGestures() {
    for (const id of [...pointers.keys()])
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    pointers.clear();
    gesture = null;
    for (const id of [...refPointers.keys()])
      if (refCanvas.hasPointerCapture(id)) refCanvas.releasePointerCapture(id);
    refPointers.clear();
    refGesture = null;
    space = false;
    hover = null;
    $("loupe").style.display = "none";
  }
  function replace(next, description, options = {}) {
    const valid = C.validateProject(next);
    finishStroke();
    const unsaved = hasUnsavedEdits(),
      pendingCache =
        pendingStoredRaw !== null &&
        (!cache || JSON.stringify(cache) !== JSON.stringify(valid));
    if (
      (unsaved || pendingCache) &&
      !window.confirm(
        (options.action || "切换作品") +
          "？" +
          (unsaved ? "当前作品有尚未保存为 JSON 的改动。" : "") +
          (pendingCache ? "还有上次未恢复的暂存；继续会替换该暂存。" : "") +
          "取消后可先保存 JSON；继续后撤销不会回到上一张图。",
      )
    )
      return false;
    clearPointerGestures();
    importSerial++;
    cache = null;
    pendingStoredRaw = null;
    $("restoreNotice").hidden = true;
    project = valid;
    history = [];
    future = [];
    savedFingerprint = options.unsaved ? null : JSON.stringify(project);
    selected = Math.max(0, Math.min(selected, project.palette.length - 1));
    syncControls();
    rebuild();
    fit();
    drawReference();
    scheduleSave();
    if (description) notify(description);
    return true;
  }
  function setPageScroll(enabled) {
    finishStroke();
    clearPointerGestures();
    pageScroll = !!enabled;
    document.body.classList.toggle("page-scroll", pageScroll);
    $("pageScrollToggle").setAttribute("aria-pressed", String(pageScroll));
    $("pageScrollToggle").setAttribute(
      "aria-label",
      pageScroll
        ? "回编辑：恢复画布上色和缩放"
        : "滑页面：在图片上也能上下滚动",
    );
    $("pageScrollLabel").textContent = pageScroll ? "回编辑" : "滑页面";
    $("pageModeNotice").hidden = !pageScroll;
    canvas.dataset.tool = pageScroll ? "page" : tool;
    requestDraw();
    status();
  }
  $("pageScrollToggle").onclick = () => setPageScroll(!pageScroll);
  function syncControls() {
    selected = Math.max(0, Math.min(selected, project.palette.length - 1));
    const s = project.settings || {};
    $("shape").value = ["circle", "square"].includes(s.shape)
      ? s.shape
      : "circle";
    $("background").value = [
      "#000000",
      "#101016",
      "#ffffff",
      "transparent",
    ].includes(s.background)
      ? s.background
      : "#000000";
    $("exportCell").value = [8, 12, 16, 24].includes(s.exportCell)
      ? String(s.exportCell)
      : "12";
    $("gridWidth").value = String(project.width);
    $("gridHeight").value = String(project.height);
    refreshPalette();
    invalidatePreview();
  }
  function refreshPalette() {
    $("palette").replaceChildren();
    project.palette.forEach((hex, i) => {
      const b = document.createElement("button");
      b.className = "swatch";
      b.style.setProperty("--swatch", hex);
      b.dataset.index = String(i);
      b.title = i + 1 + " · " + hex;
      b.setAttribute("aria-label", b.title);
      b.setAttribute("aria-pressed", String(i === selected));
      b.onclick = () => chooseColor(i);
      $("palette").append(b);
    });
    $("selectedColor").textContent =
      "当前 " + (selected + 1) + " · " + project.palette[selected];
    $("addColor").disabled = project.palette.length >= 64;
    if ($("colorPreview"))
      $("colorPreview").style.setProperty(
        "--chosen",
        project.palette[selected],
      );
    if ($("colorValue")) {
      const h = project.palette[selected].slice(1);
      $("colorValue").textContent =
        "RGB " +
        [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", ");
    }
  }
  function chooseColor(i) {
    selected = i;
    refreshPalette();
    setTool("paint");
  }
  function setTool(next) {
    finishStroke();
    tool = next;
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.tool === tool)),
      );
    canvas.dataset.tool = pageScroll ? "page" : space ? "pan" : tool;
    $("hint").textContent =
      tool === "pan"
        ? "拖动画布；滚轮或双指缩放。"
        : tool === "erase"
          ? "橡皮擦除为空格。拖动连续擦除，可撤销。"
          : tool === "pick"
            ? "点一颗豆取色，然后继续画。"
            : "单指画豆 · 双指移动缩放 · 空格拖动";
    requestDraw();
  }
  function status() {
    $("status").textContent =
      project.width +
      " × " +
      project.height +
      " 格 · " +
      count() +
      " 颗 · " +
      project.palette.length +
      " 色" +
      (hover ? " · [" + (hover.x + 1) + "," + (hover.y + 1) + "]" : "");
    $("stageLabel").textContent =
      project.width +
      " × " +
      project.height +
      " · " +
      Math.round((view.scale * 100) / 10) +
      "%";
    $("undo").disabled = !history.length;
    $("redo").disabled = !future.length;
    if ($("inspectCoords"))
      $("inspectCoords").textContent = hover
        ? hover.x + 1 + " / " + (hover.y + 1)
        : "点选或移到画布";
    if ($("inspectColor")) {
      $("inspectColor").textContent = hover
        ? project.cells[hover.y * project.width + hover.x] < 0
          ? "空位"
          : project.palette[project.cells[hover.y * project.width + hover.x]]
        : "—";
    }
  }
  function paintRaster() {
    const r = C.rasterize(project, {
      cellSize: 12,
      gap: 0.16,
      shape: $("shape").value,
      background: "transparent",
    });
    art.width = r.width;
    art.height = r.height;
    const im = artCtx.createImageData(r.width, r.height);
    im.data.set(r.data);
    artCtx.putImageData(im, 0, 0);
  }
  function rebuild() {
    paintRaster();
    status();
    requestDraw();
  }
  function requestDraw() {
    if (!raf)
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
      });
  }
  function fit() {
    let x0 = 0,
      y0 = 0,
      x1 = project.width,
      y1 = project.height;
    if (count()) {
      let minX = project.width,
        minY = project.height,
        maxX = 0,
        maxY = 0;
      for (let y = 0; y < project.height; y++)
        for (let x = 0; x < project.width; x++)
          if (project.cells[y * project.width + x] >= 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
      x0 = Math.max(0, minX - 3);
      y0 = Math.max(0, minY - 3);
      x1 = Math.min(project.width, maxX + 4);
      y1 = Math.min(project.height, maxY + 4);
    }
    view.scale = Math.max(
      0.5,
      Math.min(70, (width - 38) / (x1 - x0), (height - 44) / (y1 - y0)),
    );
    view.x = width / 2 - ((x0 + x1) / 2) * view.scale;
    view.y = height / 2 - ((y0 + y1) / 2) * view.scale;
    requestDraw();
    status();
  }
  function zoom(scale, px = width / 2, py = height / 2) {
    scale = Math.max(0.5, Math.min(70, scale));
    const wx = (px - view.x) / view.scale,
      wy = (py - view.y) / view.scale;
    view.x = px - wx * scale;
    view.y = py - wy * scale;
    view.scale = scale;
    requestDraw();
    status();
  }
  function resize() {
    const r = stage.getBoundingClientRect(),
      oldW = width,
      oldH = height;
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldW === 0) fit();
    else {
      view.x += (width - oldW) / 2;
      view.y += (height - oldH) / 2;
    }
    requestDraw();
    drawReference();
  }
  function refRect(w, h) {
    if (!reference) return null;
    const f =
        (Math.min(w / reference.width, h / reference.height) *
          Number($("refScale").value)) /
        100,
      rw = reference.width * f,
      rh = reference.height * f;
    return {
      x: (w - rw) / 2 + (w * Number($("refX").value)) / 100,
      y: (h - rh) / 2 + (h * Number($("refY").value)) / 100,
      w: rw,
      h: rh,
    };
  }
  function drawReferenceInto(c, w, h, opacity = 1) {
    if (!reference) return;
    const r = refRect(w, h);
    c.save();
    c.globalAlpha = opacity;
    c.drawImage(reference.image, r.x, r.y, r.w, r.h);
    c.restore();
  }
  const refView = { scale: 1, x: 0, y: 0 };
  const refPointers = new Map();
  let refGesture = null;
  function referenceBounds() {
    const r = refCanvas.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: Math.max(1, r.width),
      height: Math.max(1, r.height),
    };
  }
  function referencePoint(e) {
    const r = referenceBounds();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function referenceFrame(r) {
    const gw = Number($("gridWidth").value),
      gh = Number($("gridHeight").value),
      aspect =
        Number.isInteger(gw) &&
        gw >= 8 &&
        gw <= 160 &&
        Number.isInteger(gh) &&
        gh >= 8 &&
        gh <= 160
          ? gw / gh
          : project.width / project.height;
    const w = Math.max(1, Math.min(r.width - 20, (r.height - 20) * aspect));
    return { w, h: w / aspect };
  }
  function fitReferenceView() {
    resetReferenceView();
    if (!reference || $("referencePanel").hidden) return;
    const r = referenceBounds(),
      { w, h } = referenceFrame(r),
      image = refRect(w, h);
    const left = Math.min(0, image.x),
      top = Math.min(0, image.y),
      right = Math.max(w, image.x + image.w),
      bottom = Math.max(h, image.y + image.h);
    refView.scale = Math.min(
      1,
      (r.width - 20) / (right - left),
      (r.height - 20) / (bottom - top),
    );
    refView.x = ((w / 2 - (left + right) / 2) * refView.scale) / r.width;
    refView.y = ((h / 2 - (top + bottom) / 2) * refView.scale) / r.height;
    drawReference();
  }
  function resetReferenceView() {
    refView.scale = 1;
    refView.x = 0;
    refView.y = 0;
    refPointers.clear();
    refGesture = null;
    drawReference();
  }
  function zoomReference(scale, px, py) {
    const r = referenceBounds();
    px = px ?? r.width / 2;
    py = py ?? r.height / 2;
    scale = Math.max(0.25, Math.min(12, scale));
    const ratio = scale / refView.scale;
    refView.x =
      (px - r.width / 2 - (px - r.width / 2 - refView.x * r.width) * ratio) /
      r.width;
    refView.y =
      (py - r.height / 2 - (py - r.height / 2 - refView.y * r.height) * ratio) /
      r.height;
    refView.scale = scale;
    drawReference();
  }
  function drawReference() {
    const r = referenceBounds();
    if ($("referencePanel").hidden || r.width <= 1 || r.height <= 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    refCanvas.width = Math.round(r.width * dpr);
    refCanvas.height = Math.round(r.height * dpr);
    refCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refCtx.fillStyle = "#0c070d";
    refCtx.fillRect(0, 0, r.width, r.height);
    $("refViewLabel").textContent =
      "浏览 " + Math.round(refView.scale * 100) + "%";
    if (!reference) {
      refCtx.fillStyle = "#c3aac5";
      refCtx.font = "12px system-ui";
      refCtx.textAlign = "center";
      refCtx.fillText("选一张图片，或打开内置示例", r.width / 2, r.height / 2);
      return;
    }
    // The outline shows conversion crop; browsing can still reveal the whole source.
    const { w: fw, h: fh } = referenceFrame(r);
    refCtx.save();
    refCtx.translate(
      r.width / 2 + refView.x * r.width,
      r.height / 2 + refView.y * r.height,
    );
    refCtx.scale(refView.scale, refView.scale);
    refCtx.translate(-fw / 2, -fh / 2);
    refCtx.fillStyle = "#000";
    refCtx.fillRect(0, 0, fw, fh);
    refCtx.imageSmoothingEnabled = true;
    refCtx.imageSmoothingQuality = "high";
    drawReferenceInto(refCtx, fw, fh);
    refCtx.strokeStyle = "#775278";
    refCtx.lineWidth = 1 / refView.scale;
    refCtx.setLineDash([3 / refView.scale, 4 / refView.scale]);
    refCtx.strokeRect(0, 0, fw, fh);
    refCtx.restore();
  }
  refCanvas.addEventListener("pointerdown", (e) => {
    if (pageScroll) return;
    if (e.button !== 0 && e.button !== 1) return;
    refCanvas.focus({ preventScroll: true });
    const p = referencePoint(e);
    refPointers.set(e.pointerId, p);
    refCanvas.setPointerCapture(e.pointerId);
    if (refPointers.size === 1)
      refGesture = { kind: "pan", start: p, view: { ...refView } };
    else if (refPointers.size === 2) {
      const a = [...refPointers.values()];
      refGesture = {
        kind: "pinch",
        dist: Math.max(1, Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y)),
        center: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 },
        view: { ...refView },
      };
    }
    e.preventDefault();
  });
  refCanvas.addEventListener("pointermove", (e) => {
    if (pageScroll) return;
    if (!refPointers.has(e.pointerId)) return;
    const p = referencePoint(e),
      r = referenceBounds();
    refPointers.set(e.pointerId, p);
    if (refGesture?.kind === "pinch" && refPointers.size >= 2) {
      const a = [...refPointers.values()],
        center = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 },
        v = refGesture.view,
        s = Math.max(
          0.25,
          Math.min(
            12,
            (v.scale * Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y)) /
              refGesture.dist,
          ),
        ),
        ratio = s / v.scale;
      refView.x =
        (center.x -
          r.width / 2 -
          (refGesture.center.x - r.width / 2 - v.x * r.width) * ratio) /
        r.width;
      refView.y =
        (center.y -
          r.height / 2 -
          (refGesture.center.y - r.height / 2 - v.y * r.height) * ratio) /
        r.height;
      refView.scale = s;
    } else if (refGesture?.kind === "pan") {
      refView.x = refGesture.view.x + (p.x - refGesture.start.x) / r.width;
      refView.y = refGesture.view.y + (p.y - refGesture.start.y) / r.height;
    }
    drawReference();
    e.preventDefault();
  });
  function endReferencePointer(e) {
    refPointers.delete(e.pointerId);
    if (refGesture?.kind === "pinch" && refPointers.size)
      refGesture = { kind: "blocked" };
    if (!refPointers.size) refGesture = null;
    if (refCanvas.hasPointerCapture(e.pointerId))
      refCanvas.releasePointerCapture(e.pointerId);
  }
  refCanvas.addEventListener("pointerup", endReferencePointer);
  refCanvas.addEventListener("pointercancel", endReferencePointer);
  refCanvas.addEventListener("lostpointercapture", endReferencePointer);
  refCanvas.addEventListener(
    "wheel",
    (e) => {
      if (pageScroll) return;
      e.preventDefault();
      const p = referencePoint(e);
      zoomReference(refView.scale * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    },
    { passive: false },
  );
  $("refZoomOut").onclick = () => zoomReference(refView.scale / 1.35);
  $("refZoomIn").onclick = () => zoomReference(refView.scale * 1.35);
  $("refFit").onclick = fitReferenceView;
  refCanvas.addEventListener("keydown", (e) => {
    if (pageScroll) return;
    if (e.key === "+" || e.key === "=") {
      zoomReference(refView.scale * 1.35);
      e.preventDefault();
    } else if (e.key === "-") {
      zoomReference(refView.scale / 1.35);
      e.preventDefault();
    } else if (e.key === "0") {
      fitReferenceView();
      e.preventDefault();
    } else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      refView.x +=
        e.key === "ArrowLeft" ? 0.05 : e.key === "ArrowRight" ? -0.05 : 0;
      refView.y +=
        e.key === "ArrowUp" ? 0.05 : e.key === "ArrowDown" ? -0.05 : 0;
      drawReference();
      e.preventDefault();
    }
  });

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#030203";
    ctx.fillRect(0, 0, width, height);
    const w = project.width * view.scale,
      h = project.height * view.scale;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.fillStyle =
      $("background").value === "transparent"
        ? "#dde3dd"
        : $("background").value;
    ctx.fillRect(0, 0, w, h);
    if ($("background").value === "transparent") {
      ctx.fillStyle = "#c6cec8";
      for (let y = 0; y < h; y += 20)
        for (let x = 0; x < w; x += 20)
          if ((Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0)
            ctx.fillRect(x, y, Math.min(20, w - x), Math.min(20, h - y));
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    if ($("viewMode").value === "trace")
      drawReferenceInto(ctx, w, h, Number($("refOpacity").value) / 100);
    ctx.imageSmoothingEnabled = view.scale < 8;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(art, 0, 0, w, h);
    ctx.restore();
    if ($("grid").checked && view.scale >= 2.5) {
      ctx.fillStyle = "rgba(183,131,187,.22)";
      const rr = Math.min(1.1, view.scale * 0.12);
      const gx0 = Math.max(0, Math.floor(-view.x / view.scale)),
        gy0 = Math.max(0, Math.floor(-view.y / view.scale)),
        gx1 = Math.min(project.width, Math.ceil((width - view.x) / view.scale)),
        gy1 = Math.min(
          project.height,
          Math.ceil((height - view.y) / view.scale),
        );
      for (let y = gy0; y < gy1; y++) {
        ctx.beginPath();
        for (let x = gx0; x < gx1; x++)
          if (project.cells[y * project.width + x] < 0) {
            const px = (x + 0.5) * view.scale,
              py = (y + 0.5) * view.scale;
            ctx.moveTo(px + rr, py);
            ctx.arc(px, py, rr, 0, Math.PI * 2);
          }
        ctx.fill();
      }
    }
    if (hover) {
      ctx.strokeStyle = "#f6deff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        hover.x * view.scale + 1,
        hover.y * view.scale + 1,
        view.scale - 2,
        view.scale - 2,
      );
    }
    ctx.restore();
  }
  function point(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function cell(p) {
    const x = Math.floor((p.x - view.x) / view.scale),
      y = Math.floor((p.y - view.y) / view.scale);
    return x >= 0 && y >= 0 && x < project.width && y < project.height
      ? { x, y }
      : null;
  }
  function finishStroke() {
    if (stroke) {
      pushBefore(stroke.before);
      stroke = null;
      status();
    }
  }
  function drawLoupe(c) {
    if (!c) return;
    const l = $("loupe");
    l.width = 120;
    l.height = 120;
    const x = l.getContext("2d");
    x.fillStyle = "#101016";
    x.fillRect(0, 0, 120, 120);
    x.imageSmoothingEnabled = false;
    const gx = Math.max(0, Math.min(project.width - 5, c.x - 2)),
      gy = Math.max(0, Math.min(project.height - 5, c.y - 2));
    x.drawImage(art, gx * 12, gy * 12, 60, 60, 0, 0, 120, 120);
    x.strokeStyle = "#f6deff";
    x.lineWidth = 2;
    x.strokeRect((c.x - gx) * 24 + 1, (c.y - gy) * 24 + 1, 22, 22);
    l.style.display = "block";
  }
  function mark(c) {
    if (!c) return;
    if (tool === "pick") {
      const i = project.cells[c.y * project.width + c.x];
      if (i >= 0) chooseColor(i);
      return;
    }
    if (tool !== "paint" && tool !== "erase") return;
    if (!stroke) stroke = { before: snapshot(), last: c };
    C.paintLine(
      project,
      stroke.last.x,
      stroke.last.y,
      c.x,
      c.y,
      tool === "erase" ? -1 : selected,
    );
    stroke.last = c;
    paintRaster();
    status();
    requestDraw();
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (pageScroll) return;
    if (e.button !== 0 && e.button !== 1) return;
    canvas.focus({ preventScroll: true });
    const p = point(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      $("loupe").style.display = "none";
      if (stroke) {
        project = stroke.before;
        stroke = null;
        rebuild();
      }
      const a = [...pointers.values()];
      gesture = {
        kind: "pinch",
        dist: Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y),
        center: { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 },
        view: { ...view },
      };
      return;
    }
    if (pointers.size > 2) return;
    if (tool === "pan" || space || e.button === 1) {
      gesture = { kind: "pan", start: p, view: { ...view } };
      return;
    }
    if (tool === "pick") {
      mark(cell(p));
      gesture = { kind: "blocked" };
      return;
    }
    gesture = { kind: "paint" };
    mark(cell(p));
    if (e.pointerType === "touch") drawLoupe(cell(p));
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pageScroll) return;
    const p = point(e);
    hover = cell(p);
    status();
    if (!pointers.has(e.pointerId)) {
      requestDraw();
      return;
    }
    pointers.set(e.pointerId, p);
    if (gesture?.kind === "pinch" && pointers.size >= 2) {
      const a = [...pointers.values()],
        center = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 },
        d = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y),
        v = gesture.view,
        s = Math.max(
          0.5,
          Math.min(70, (v.scale * d) / Math.max(1, gesture.dist)),
        );
      view = {
        scale: s,
        x: center.x - ((gesture.center.x - v.x) / v.scale) * s,
        y: center.y - ((gesture.center.y - v.y) / v.scale) * s,
      };
    } else if (gesture?.kind === "pan") {
      view.x = gesture.view.x + p.x - gesture.start.x;
      view.y = gesture.view.y + p.y - gesture.start.y;
    } else if (gesture?.kind === "paint") {
      mark(cell(p));
      if (e.pointerType === "touch") drawLoupe(cell(p));
    }
    requestDraw();
    e.preventDefault();
  });
  function endPointer(e) {
    $("loupe").style.display = "none";
    pointers.delete(e.pointerId);
    if (gesture?.kind === "pinch" && pointers.size) {
      gesture = { kind: "blocked" };
      return;
    }
    if (pointers.size === 0) {
      finishStroke();
      gesture = null;
    }
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);
  canvas.addEventListener("pointerleave", () => {
    if (!pointers.size) {
      hover = null;
      requestDraw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (pageScroll) return;
      e.preventDefault();
      const p = point(e);
      zoom(view.scale * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    },
    { passive: false },
  );
  function undo() {
    finishStroke();
    if (!history.length) return;
    future.push(snapshot());
    project = history.pop();
    syncControls();
    rebuild();
    drawReference();
    scheduleSave();
  }
  function redo() {
    finishStroke();
    if (!future.length) return;
    history.push(snapshot());
    project = future.pop();
    syncControls();
    rebuild();
    drawReference();
    scheduleSave();
  }
  function invalidatePreview() {
    conversionSerial++;
    candidate = null;
    $("previewBox").hidden = true;
    if ($("previewDialog").open) $("previewDialog").close();
  }
  function dimensions() {
    const w = Number($("gridWidth").value),
      h = Number($("gridHeight").value);
    assert(
      Number.isInteger(w) &&
        Number.isInteger(h) &&
        w >= 8 &&
        h >= 8 &&
        w <= 160 &&
        h <= 160,
      "宽高需要是 8–160 的整数。",
    );
    return { w, h };
  }

  function applyBrightness(out) {
    const lift = Number($("brightness").value) / 100,
      saturation = Number($("saturation").value) / 100;
    // Adjust chroma from the fresh sample before exposure clipping. At 100%,
    // skip this branch so every byte follows the previous brightness pipeline.
    if (saturation !== 1)
      for (let k = 0; k < out.length; k += 4) {
        if (!out[k + 3]) continue;
        const r = out[k],
          g = out[k + 1],
          b = out[k + 2],
          luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        out[k] = Math.max(
          0,
          Math.min(255, Math.round(luma + (r - luma) * saturation)),
        );
        out[k + 1] = Math.max(
          0,
          Math.min(255, Math.round(luma + (g - luma) * saturation)),
        );
        out[k + 2] = Math.max(
          0,
          Math.min(255, Math.round(luma + (b - luma) * saturation)),
        );
      }
    if (lift !== 1)
      for (let k = 0; k < out.length; k += 4)
        for (let c = 0; c < 3; c++)
          out[k + c] = Math.min(255, Math.round(out[k + c] * lift));
    return out;
  }
  // Integrate native source pixels in linear light. Never shrink in sRGB first:
  // that would irreversibly darken dense lights before this sampler sees them.
  function sampleLinearReference(w, h) {
    const sw = reference.width,
      sh = reference.height,
      tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const c = tmp.getContext("2d", { willReadFrequently: true });
    c.drawImage(reference.image, 0, 0);
    const src = c.getImageData(0, 0, sw, sh).data;
    tmp.width = tmp.height = 1;
    const lut = Float64Array.from({ length: 256 }, (_, i) => {
        const v = i / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }),
      encode = (v) =>
        Math.round(
          255 *
            (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055),
        );
    const rect = refRect(w, h),
      scale = rect.w / sw,
      area = 1 / (scale * scale),
      out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const top = (y - rect.y) / scale,
        bottom = (y + 1 - rect.y) / scale,
        sy0 = Math.max(0, Math.floor(top)),
        sy1 = Math.min(sh, Math.ceil(bottom));
      for (let x = 0; x < w; x++) {
        const left = (x - rect.x) / scale,
          right = (x + 1 - rect.x) / scale,
          sx0 = Math.max(0, Math.floor(left)),
          sx1 = Math.min(sw, Math.ceil(right));
        let a = 0,
          r = 0,
          g = 0,
          b = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          const wy = Math.max(0, Math.min(bottom, sy + 1) - Math.max(top, sy));
          for (let sx = sx0; sx < sx1; sx++) {
            const k = (sy * sw + sx) * 4,
              weight =
                (wy *
                  Math.max(0, Math.min(right, sx + 1) - Math.max(left, sx)) *
                  src[k + 3]) /
                255;
            if (!weight) continue;
            a += weight;
            r += lut[src[k]] * weight;
            g += lut[src[k + 1]] * weight;
            b += lut[src[k + 2]] * weight;
          }
        }
        if (a) {
          const k = (y * w + x) * 4;
          out[k] = encode(r / a);
          out[k + 1] = encode(g / a);
          out[k + 2] = encode(b / a);
          out[k + 3] = Math.round(255 * Math.min(1, a / area));
        }
      }
    }
    return out;
  }

  function sampleReference(w, h) {
    assert(reference, "请先选择本地图片。");
    const mode = $("sampleMode").value;
    if (mode === "auto") return applyBrightness(sampleLinearReference(w, h));
    const sub = mode === "nearest" ? 1 : 6,
      tmp = document.createElement("canvas");
    tmp.width = w * sub;
    tmp.height = h * sub;
    const c = tmp.getContext("2d", { willReadFrequently: true });
    c.imageSmoothingEnabled = mode !== "nearest";
    c.imageSmoothingQuality = "high";
    drawReferenceInto(c, tmp.width, tmp.height);
    const src = c.getImageData(0, 0, tmp.width, tmp.height).data,
      out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let a = 0,
          r = 0,
          g = 0,
          b = 0,
          points = [];
        for (let sy = 0; sy < sub; sy++)
          for (let sx = 0; sx < sub; sx++) {
            const i = ((y * sub + sy) * w * sub + x * sub + sx) * 4,
              alpha = src[i + 3] / 255;
            if (mode === "bright")
              points.push([
                src[i],
                src[i + 1],
                src[i + 2],
                alpha,
                0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2],
              ]);
            else {
              a += alpha;
              r += src[i] * alpha;
              g += src[i + 1] * alpha;
              b += src[i + 2] * alpha;
            }
          }
        if (mode === "bright") {
          points = points.filter((p) => p[3] > 0.3).sort((p, q) => q[4] - p[4]);
          const n = Math.max(1, Math.ceil(points.length * 0.25));
          for (const p of points.slice(0, n)) {
            a += p[3];
            r += p[0] * p[3];
            g += p[1] * p[3];
            b += p[2] * p[3];
          }
          const k = (y * w + x) * 4;
          if (a) {
            out[k] = Math.round(r / a);
            out[k + 1] = Math.round(g / a);
            out[k + 2] = Math.round(b / a);
            out[k + 3] = Math.round((255 * points.length) / (sub * sub));
          }
        } else {
          const k = (y * w + x) * 4;
          if (a) {
            out[k] = Math.round(r / a);
            out[k + 1] = Math.round(g / a);
            out[k + 2] = Math.round(b / a);
            out[k + 3] = Math.round((255 * a) / (sub * sub));
          }
        }
      }
    return applyBrightness(out);
  }
  function showCandidate(next) {
    candidate = next;
    const r = C.rasterize(next, {
        cellSize: 12,
        gap: 0.16,
        shape: $("shape").value,
        background: $("background").value,
      }),
      pc = $("previewCanvas");
    pc.width = r.width;
    pc.height = r.height;
    const c = pc.getContext("2d"),
      im = c.createImageData(r.width, r.height);
    im.data.set(r.data);
    c.putImageData(im, 0, 0);
    $("previewInfo").textContent =
      next.width +
      " × " +
      next.height +
      " 格，" +
      next.palette.length +
      " 色，" +
      next.cells.filter((v) => v >= 0).length +
      " 颗。";
    $("previewBox").hidden = false;
  }
  $("convert").onclick = () => {
    try {
      finishStroke();
      const { w, h } = dimensions(),
        button = $("convert"),
        serial = ++conversionSerial;
      assert(reference, "请先选择本地图片。");
      button.disabled = true;
      button.textContent = "正在转换…";
      setTimeout(() => {
        try {
          if (serial !== conversionSerial) return;
          const sampled = sampleReference(w, h),
            next = C.convertRGBA(sampled, w, h, {
              colors: Number($("colorCount").value),
              alphaThreshold: 80,
              ignoreNearBlack: $("ignoreBlack").checked,
              blackThreshold: 24,
            });
          next.settings = {
            shape: $("shape").value,
            background: $("background").value,
            exportCell: Number($("exportCell").value),
          };
          showCandidate(next);
          notify("转换预览已生成。点击“就用这张”才会替换画布。");
        } catch (e) {
          notify(e.message, true);
        } finally {
          button.disabled = false;
          button.textContent = "看看转图";
        }
      }, 20);
    } catch (e) {
      notify(e.message, true);
    }
  };
  $("applyConversion").onclick = () => {
    if (candidate) {
      const p = candidate;
      replace(p, "已采用转换，已开始本作品的独立撤销记录。", {
        action: "采用转图作为新作品",
        unsaved: true,
      });
    }
  };
  $("newBlank").onclick = () => {
    try {
      const { w, h } = dimensions();
      const p = C.blank(w, h);
      p.settings = {
        shape: $("shape").value,
        background: $("background").value,
        exportCell: Number($("exportCell").value),
      };
      if (
        !replace(p, "已新建空白作品，撤销记录已清空。", {
          action: "新建空白作品",
        })
      )
        return;
      $("viewMode").value = "free";
      setViewMode();
    } catch (e) {
      notify(e.message, true);
    }
  };
  function setViewMode() {
    finishStroke();
    clearPointerGestures();
    const mode = $("viewMode").value;
    $("refOpacity").disabled = mode !== "trace";
    $("refOpacity").title =
      mode === "trace" ? "描绘底图透明度" : "仅在“描着画”模式可用";
    $("referencePanel").hidden = !["side", "horizontal"].includes(mode);
    $("viewspace").classList.toggle(
      "compare-horizontal",
      mode === "horizontal",
    );
    resize();
    drawReference();
    requestDraw();
  }
  $("viewMode").onchange = setViewMode;
  for (const id of ["refScale", "refX", "refY", "refOpacity"])
    $(id).oninput = () => {
      const map = {
        refScale: "scaleValue",
        refX: "xValue",
        refY: "yValue",
        refOpacity: "opacityValue",
      };
      $(map[id]).textContent = $(id).value + "%";
      if (id !== "refOpacity") invalidatePreview();
      drawReference();
      requestDraw();
    };
  function resetRef() {
    for (const [id, v] of [
      ["refScale", 100],
      ["refX", 0],
      ["refY", 0],
    ]) {
      $(id).value = String(v);
      $(id).oninput();
    }
    drawReference();
    requestDraw();
  }
  $("resetReference").onclick = resetRef;
  $("clearReference").onclick = () => {
    imageSerial++;
    if (refUrl) URL.revokeObjectURL(refUrl);
    refUrl = null;
    reference = null;
    resetReferenceView();
    $("imageName").textContent = "PNG / JPEG / WebP，最多 25 MB";
    invalidatePreview();
    drawReference();
    requestDraw();
    notify("已移除参考图，作品保留。");
  };
  $("chooseImage").onclick = () => $("imageInput").click();
  $("mobileChooseImage").onclick = () => $("imageInput").click();
  $("imageInput").onchange = async (e) => {
    const f = e.target.files[0],
      serial = ++imageSerial;
    e.target.value = "";
    if (!f) return;
    let url;
    try {
      assert(
        ["image/png", "image/jpeg", "image/webp"].includes(f.type),
        "仅支持 PNG、JPEG、WebP 图片。",
      );
      assert(f.size <= 25 * 1024 * 1024, "图片不能超过 25 MB。");
      url = URL.createObjectURL(f);
      const im = new Image();
      await new Promise((resolve, reject) => {
        im.onload = resolve;
        im.onerror = () => reject(Error("这张图片无法读取。"));
        im.src = url;
      });
      if (serial !== imageSerial) {
        URL.revokeObjectURL(url);
        return;
      }
      assert(
        im.naturalWidth * im.naturalHeight <= 24000000,
        "图片超过 2400 万像素，请先缩小。",
      );
      if (refUrl) URL.revokeObjectURL(refUrl);
      reference = {
        image: im,
        width: im.naturalWidth,
        height: im.naturalHeight,
      };
      resetReferenceView();
      refUrl = url;
      $("imageName").textContent =
        f.name + " · " + im.naturalWidth + " × " + im.naturalHeight;
      resetRef();
      if (!["side", "horizontal"].includes($("viewMode").value))
        $("viewMode").value = window.innerWidth >= 900 ? "horizontal" : "side";
      setViewMode();
      notify("图片已在本机打开。调整格数和颜色，再预览转换。");
    } catch (err) {
      if (url) URL.revokeObjectURL(url);
      if (serial === imageSerial) notify(err.message, true);
    }
  };
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function stamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
  function exportRaster() {
    finishStroke();
    return C.rasterize(project, {
      cellSize: Number($("exportCell").value),
      shape: $("shape").value,
      gap: 0.16,
      background: $("background").value,
    });
  }
  $("exportJson").onclick = () => {
    finishStroke();
    setSettings();
    download(
      new Blob([JSON.stringify(project)], {
        type: "application/json;charset=utf-8",
      }),
      "点灯匣作品_" + stamp() + ".json",
    );
    savedFingerprint = JSON.stringify(project);
    saveLocal();
    notify("JSON 下载已发起，可以再次打开继续编辑。");
  };
  $("exportPng").onclick = () => {
    try {
      const r = exportRaster(),
        c = document.createElement("canvas");
      c.width = r.width;
      c.height = r.height;
      const x = c.getContext("2d"),
        im = x.createImageData(r.width, r.height);
      im.data.set(r.data);
      x.putImageData(im, 0, 0);
      c.toBlob((blob) => {
        if (blob) {
          download(
            blob,
            "点灯匣作品_" + r.width + "x" + r.height + "_" + stamp() + ".png",
          );
          notify("PNG 下载已发起，只含作品，不含参考图或格线。");
        } else notify("PNG 生成失败，请重试。", true);
      }, "image/png");
    } catch (e) {
      notify(e.message, true);
    }
  };
  $("mobilePng").onclick = () => $("exportPng").click();
  $("mobileJson").onclick = () => $("exportJson").click();
  $("mobileImport").onclick = () => $("importProject").click();
  $("importProject").onclick = () => $("projectInput").click();
  $("projectInput").onchange = async (e) => {
    const f = e.target.files[0],
      serial = ++importSerial;
    e.target.value = "";
    if (!f) return;
    try {
      assert(f.size <= 4 * 1024 * 1024, "JSON 不能超过 4 MB。");
      const text = await f.text();
      if (serial !== importSerial) return;
      replace(
        C.validateProject(JSON.parse(text)),
        "作品已打开，撤销记录从这张图重新开始。",
        { action: "打开导入的 JSON 作品" },
      );
    } catch (err) {
      if (serial === importSerial)
        notify(
          "未导入，当前作品不变。" +
            (err instanceof SyntaxError ? "JSON 语法错误。" : err.message),
          true,
        );
    }
  };
  $("addColor").onclick = () => {
    finishStroke();
    const hex = $("customColor").value.toUpperCase(),
      found = project.palette.findIndex((v) => v.toUpperCase() === hex);
    if (found >= 0) {
      chooseColor(found);
      notify("该颜色已在调色板中。");
      return;
    }
    if (project.palette.length >= 64) {
      notify("最多 64 色。", true);
      return;
    }
    const before = snapshot();
    project.palette.push(hex);
    pushBefore(before);
    chooseColor(project.palette.length - 1);
    status();
  };
  $("undo").onclick = undo;
  $("redo").onclick = redo;
  $("zoomIn").onclick = () => zoom(view.scale * 1.35);
  $("zoomOut").onclick = () => zoom(view.scale / 1.35);
  $("fit").onclick = fit;
  $("grid").onchange = requestDraw;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  for (const id of ["shape", "background", "exportCell"])
    $(id).onchange = () => {
      finishStroke();
      const before = snapshot();
      setSettings();
      pushBefore(before);
      invalidatePreview();
      rebuild();
      drawReference();
    };
  for (const id of [
    "gridWidth",
    "gridHeight",
    "colorCount",
    "sampleMode",
    "ignoreBlack",
  ])
    $(id).onchange = () => {
      invalidatePreview();
      if (id === "gridWidth" || id === "gridHeight") drawReference();
    };

  $("brightness").oninput = () => {
    $("brightnessValue").textContent = $("brightness").value + "%";
    invalidatePreview();
  };
  $("saturation").oninput = () => {
    $("saturationValue").textContent = $("saturation").value + "%";
    $("saturation").setAttribute("aria-valuetext", $("saturation").value + "%");
    $("resetSaturation").disabled = Number($("saturation").value) === 100;
    invalidatePreview();
  };
  $("resetSaturation").onclick = () => {
    $("saturation").value = "100";
    $("saturation").oninput();
  };
  // Preview navigation is independent from the artwork's editing viewport.
  const previewDialog = $("previewDialog"),
    previewStage = $("previewViewport"),
    largePreview = $("largePreview"),
    largeCtx = largePreview.getContext("2d");
  let previewView = { scale: 1, x: 0, y: 0 },
    previewSize = { width: 1, height: 1 },
    previewPointers = new Map(),
    previewGesture = null,
    previewFocus = null;
  function drawLargePreview() {
    if (!previewDialog.open || !candidate) return;
    const { width: w, height: h } = previewSize;
    largeCtx.clearRect(0, 0, w, h);
    largeCtx.fillStyle = "#030203";
    largeCtx.fillRect(0, 0, w, h);
    largeCtx.imageSmoothingEnabled = previewView.scale < 1;
    largeCtx.imageSmoothingQuality = "high";
    largeCtx.drawImage(
      $("previewCanvas"),
      previewView.x,
      previewView.y,
      $("previewCanvas").width * previewView.scale,
      $("previewCanvas").height * previewView.scale,
    );
    $("previewZoomLabel").textContent =
      Math.round(previewView.scale * 100) + "%";
  }
  function fitPreview() {
    const c = $("previewCanvas");
    previewView.scale = Math.min(
      (previewSize.width - 24) / c.width,
      (previewSize.height - 24) / c.height,
    );
    previewView.x = (previewSize.width - c.width * previewView.scale) / 2;
    previewView.y = (previewSize.height - c.height * previewView.scale) / 2;
    drawLargePreview();
  }
  function resizePreview(initial = false) {
    if (!previewDialog.open) return;
    const r = previewStage.getBoundingClientRect(),
      old = previewSize;
    previewSize = { width: r.width, height: r.height };
    const dpr = Math.min(devicePixelRatio || 1, 2);
    largePreview.width = Math.round(r.width * dpr);
    largePreview.height = Math.round(r.height * dpr);
    largeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (initial) fitPreview();
    else {
      previewView.x += (r.width - old.width) / 2;
      previewView.y += (r.height - old.height) / 2;
      drawLargePreview();
    }
  }
  function zoomPreview(
    scale,
    x = previewSize.width / 2,
    y = previewSize.height / 2,
  ) {
    scale = Math.max(0.02, Math.min(12, scale));
    const ratio = scale / previewView.scale;
    previewView.x = x - (x - previewView.x) * ratio;
    previewView.y = y - (y - previewView.y) * ratio;
    previewView.scale = scale;
    drawLargePreview();
  }
  function previewPoint(e) {
    const r = largePreview.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function openPreview() {
    if (!candidate) return;
    finishStroke();
    clearPointerGestures();
    previewFocus = document.activeElement;
    $("largePreviewInfo").textContent = $("previewInfo").textContent;
    previewDialog.showModal();
    document.body.classList.add("preview-opened");
    resizePreview(true);
  }
  $("enlargePreview").onclick = openPreview;
  $("closePreview").onclick = () => previewDialog.close();
  $("previewZoomIn").onclick = () => zoomPreview(previewView.scale * 1.35);
  $("previewZoomOut").onclick = () => zoomPreview(previewView.scale / 1.35);
  $("previewFit").onclick = fitPreview;
  $("applyLargePreview").onclick = () => $("applyConversion").click();
  previewDialog.addEventListener("close", () => {
    previewPointers.clear();
    previewGesture = null;
    document.body.classList.remove("preview-opened");
    previewFocus?.focus({ preventScroll: true });
  });
  previewDialog.addEventListener("click", (e) => {
    if (e.target !== previewDialog) return;
    const r = previewDialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      previewDialog.close();
  });
  largePreview.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = previewPoint(e);
      zoomPreview(previewView.scale * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    },
    { passive: false },
  );
  largePreview.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = previewPoint(e);
    largePreview.setPointerCapture(e.pointerId);
    previewPointers.set(e.pointerId, p);
    if (previewPointers.size === 1)
      previewGesture = { kind: "pan", start: p, view: { ...previewView } };
    else if (previewPointers.size === 2) {
      const [a, b] = [...previewPointers.values()];
      previewGesture = {
        kind: "pinch",
        dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: { ...previewView },
      };
    }
    e.preventDefault();
  });
  largePreview.addEventListener("pointermove", (e) => {
    if (!previewPointers.has(e.pointerId)) return;
    const p = previewPoint(e);
    previewPointers.set(e.pointerId, p);
    if (previewGesture?.kind === "pan") {
      previewView.x = previewGesture.view.x + p.x - previewGesture.start.x;
      previewView.y = previewGesture.view.y + p.y - previewGesture.start.y;
    } else if (previewGesture?.kind === "pinch" && previewPointers.size >= 2) {
      const [a, b] = [...previewPointers.values()],
        v = previewGesture.view,
        center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale = Math.max(
          0.02,
          Math.min(
            12,
            (v.scale * Math.hypot(b.x - a.x, b.y - a.y)) / previewGesture.dist,
          ),
        );
      previewView = {
        scale,
        x: center.x - ((previewGesture.center.x - v.x) / v.scale) * scale,
        y: center.y - ((previewGesture.center.y - v.y) / v.scale) * scale,
      };
    }
    drawLargePreview();
    e.preventDefault();
  });
  function endPreviewPointer(e) {
    previewPointers.delete(e.pointerId);
    previewGesture = previewPointers.size ? { kind: "blocked" } : null;
    if (largePreview.hasPointerCapture(e.pointerId))
      largePreview.releasePointerCapture(e.pointerId);
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    largePreview.addEventListener(type, endPreviewPointer);
  largePreview.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") {
      zoomPreview(previewView.scale * 1.35);
      e.preventDefault();
    } else if (e.key === "-") {
      zoomPreview(previewView.scale / 1.35);
      e.preventDefault();
    } else if (e.key === "0") {
      fitPreview();
      e.preventDefault();
    } else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      previewView.x +=
        e.key === "ArrowLeft" ? 32 : e.key === "ArrowRight" ? -32 : 0;
      previewView.y +=
        e.key === "ArrowUp" ? 32 : e.key === "ArrowDown" ? -32 : 0;
      drawLargePreview();
      e.preventDefault();
    }
  });
  new ResizeObserver(() => resizePreview()).observe(previewStage);
  let orientationFullscreen = false;
  $("screenDirection").onchange = async () => {
    const control = $("screenDirection"),
      direction = control.value;
    control.disabled = true;
    try {
      if (direction === "auto") {
        screen.orientation?.unlock?.();
        if (orientationFullscreen && document.fullscreenElement)
          await document.exitFullscreen();
        orientationFullscreen = false;
        $("orientationHint").textContent = "跟随设备方向，布局自动适配";
        return;
      }
      if (typeof screen.orientation?.lock !== "function")
        throw Error("unsupported");
      if (
        !document.fullscreenElement &&
        document.documentElement.requestFullscreen
      ) {
        await document.documentElement.requestFullscreen();
        orientationFullscreen = true;
      }
      await screen.orientation.lock(direction);
      $("orientationHint").textContent =
        "已选择" +
        (direction === "landscape" ? "横屏" : "竖屏") +
        "；选择“跟随设备”可退出锁定";
    } catch (e) {
      control.value = "auto";
      screen.orientation?.unlock?.();
      if (orientationFullscreen && document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {}
      }
      orientationFullscreen = false;
      $("orientationHint").textContent =
        "此浏览器不支持锁定，请使用系统旋转；布局仍会自动适配";
      notify("屏幕未锁定。请开启系统自动旋转，再转动设备。");
    } finally {
      control.disabled = false;
      resize();
    }
  };
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && orientationFullscreen) {
      orientationFullscreen = false;
      $("screenDirection").value = "auto";
      screen.orientation?.unlock?.();
      $("orientationHint").textContent = "已退出全屏，跟随设备方向";
    }
  });

  window.addEventListener("keydown", (e) => {
    if (previewDialog.open || e.target.matches("input,select,textarea")) return;
    const k = e.key.toLowerCase(),
      mod = e.ctrlKey || e.metaKey;
    if (mod && k === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (mod && k === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && k === "s") {
      e.preventDefault();
      $("exportJson").click();
      return;
    }
    if (mod) return;
    if (e.code === "Space" && !pageScroll) {
      e.preventDefault();
      space = true;
      canvas.dataset.tool = "pan";
      return;
    }
    if (k === "b") setTool("paint");
    if (k === "e") setTool("erase");
    if (k === "i") setTool("pick");
    if (k === "h") setTool("pan");
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      space = false;
      canvas.dataset.tool = tool;
    }
  });
  window.addEventListener("blur", () => {
    $("loupe").style.display = "none";
    space = false;
    finishStroke();
    pointers.clear();
    gesture = null;
    refPointers.clear();
    refGesture = null;
    canvas.dataset.tool = tool;
  });
  function flushLocal() {
    finishStroke();
    if (dirty) saveLocal();
  }
  window.addEventListener("beforeunload", flushLocal);
  window.addEventListener("pagehide", flushLocal);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLocal();
  });
  try {
    const scoped = localStorage.getItem(STORAGE);
    pendingStoredRaw =
      scoped === null ? localStorage.getItem(LEGACY_STORAGE) : scoped;
    if (pendingStoredRaw !== null) {
      $("restoreNotice").hidden = false;
      try {
        cache = C.validateProject(JSON.parse(pendingStoredRaw));
      } catch {
        $("restore").disabled = true;
        $("restore").title = "当前版本无法打开这份暂存";
        $("restoreNotice").querySelector("span").textContent =
          "这份暂存当前无法打开，请先备份原始记录。";
        $("saveStatus").textContent = "原始暂存已保留 · 当前作品请保存 JSON";
      }
    }
  } catch (e) {
    storageOK = false;
    storageReadBlocked = true;
    $("saveStatus").textContent = "无法读取本机暂存 · 当前作品请保存 JSON";
  }
  $("restore").onclick = () => {
    if (
      cache &&
      replace(cache, "已恢复本机暂存，建议保存 JSON。", {
        action: "恢复暂存作品",
        unsaved: true,
      })
    ) {
      cache = null;
      $("restoreNotice").hidden = true;
    }
  };
  $("discard").onclick = () => {
    if (storageReadBlocked) return;
    if (
      !window.confirm(
        "用当前作品替换上次暂存？请先点“备份 JSON”保存原始记录；取消会保留上次暂存。",
      )
    )
      return;
    cache = null;
    pendingStoredRaw = null;
    $("restoreNotice").hidden = true;
    saveLocal();
  };
  $("exportPrevious").onclick = () => {
    if (pendingStoredRaw !== null) {
      download(
        new Blob([pendingStoredRaw], {
          type: "application/json",
        }),
        "点灯匣-上次暂存.json",
      );
      if (!cache)
        notify("原始暂存备份下载已发起；此版本暂不能打开它，请妥善保留。");
    }
  };
  Object.defineProperty(window, "beadPlayground", {
    value: Object.freeze({
      getProject: () => snapshot(),
      getView: () => ({ ...view, width, height }),
      getReferenceView: () => ({
        ...refView,
        width: referenceBounds().width,
        height: referenceBounds().height,
      }),
      getRaster: () => exportRaster(),
      getCandidate: () => (candidate ? C.clone(candidate) : null),
      getDiagnostics: () => ({
        tool,
        selected,
        undo: history.length,
        redo: future.length,
        referenceLoaded: !!reference,
        appVersion: document.querySelector('meta[name="application-version"]')
          ?.content,
        storageOK,
        pageScroll,
        unsaved: hasUnsavedEdits(),
        network: "disabled",
      }),
      sampleReference: (w, h) => sampleReference(w, h),
    }),
    writable: false,
  });

  function setExampleReference(example) {
    const serial = ++imageSerial;
    const im = new Image();
    im.onload = () => {
      if (serial !== imageSerial) return;
      if (refUrl) URL.revokeObjectURL(refUrl);
      refUrl = null;
      reference = {
        image: im,
        width: im.naturalWidth,
        height: im.naturalHeight,
      };
      resetReferenceView();
      $("imageName").textContent = example.name + " · 内置参考";
      resetRef();
      drawReference();
      requestDraw();
    };
    im.onerror = () => {
      if (serial === imageSerial)
        notify("示例参考图读取失败，编辑数据仍可使用。", true);
    };
    im.src = example.referenceDataUrl;
  }
  function loadExample(example) {
    if (
      !replace(
        example.project,
        "已打开" + example.name + "，撤销仅针对当前作品。",
        { action: "打开" + example.name + "示例" },
      )
    )
      return;
    setExampleReference(example);
    $("viewMode").value = "free";
    setViewMode();
  }
  if ($("examples"))
    EXAMPLES.forEach((example) => {
      const b = document.createElement("button");
      b.className = "example-button";
      b.dataset.example = example.id;
      const img = document.createElement("img");
      img.src = example.thumbDataUrl;
      img.alt = example.name + "示例";
      const t = document.createElement("span"),
        name = document.createElement("strong"),
        desc = document.createElement("small");
      name.textContent = example.name;
      desc.textContent =
        example.project.width +
        " × " +
        example.project.height +
        " · " +
        example.project.palette.length +
        " 色";
      t.append(name, desc);
      b.append(img, t);
      b.onclick = () => loadExample(example);
      $("examples").append(b);
    });

  document.querySelectorAll("[data-panel-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          b.dataset.panelTab === "reference" &&
          $("viewMode").value === "free" &&
          reference
        ) {
          $("viewMode").value = innerWidth >= 900 ? "horizontal" : "side";
          setViewMode();
        }
        document
          .querySelectorAll("[data-panel-tab]")
          .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
        document
          .querySelectorAll("[data-panel]")
          .forEach((p) =>
            p.classList.toggle(
              "panel-active",
              p.dataset.panel === b.dataset.panelTab,
            ),
          );
        $("sidebar")?.scrollTo?.(0, 0);
        $("sidebar")?.scrollIntoView?.({
          block: "nearest",
          behavior: "instant",
        });
      }),
  );
  document
    .querySelectorAll("[data-panel]")
    .forEach((p) =>
      p.classList.toggle("panel-active", p.dataset.panel === "convert"),
    );

  if ($("headerExport"))
    $("headerExport").onclick = () => {
      const b = [...document.querySelectorAll("[data-panel-tab]")].find(
        (e) => e.dataset.panelTab === "export",
      );
      b?.click();
    };
  const publicSiteUrl = "https://glintile.game.brothforge.com/";
  const shareButton = $("headerShare"),
    shareDialog = $("shareDialog");
  function showShareLink() {
    $("shareUrl").value = publicSiteUrl;
    if (!shareDialog.open) shareDialog.showModal();
    $("shareUrl").focus();
    $("shareUrl").select();
  }
  shareButton.onclick = async () => {
    if (shareButton.disabled) return;
    shareButton.disabled = true;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "Glintile · 点灯匣",
          url: publicSiteUrl,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicSiteUrl);
        notify("点灯匣链接已复制，可以粘贴分享。");
      } else showShareLink();
    } catch (error) {
      if (error.name !== "AbortError") showShareLink();
    } finally {
      shareButton.disabled = false;
    }
  };
  $("closeShare").onclick = () => shareDialog.close();
  shareDialog.addEventListener("close", () =>
    shareButton.focus({ preventScroll: true }),
  );
  if (MOBILE) {
    $("viewMode").value = "free";
    $("referencePanel").hidden = true;
  }
  setSettings();
  savedFingerprint = JSON.stringify(project);
  syncControls();
  setTool("paint");
  rebuild();
  if (EXAMPLES.length) {
    $("viewMode").value = "free";
    $("referencePanel").hidden = true;
    const cat = EXAMPLES.find((e) => e.id === "cat");
    if (cat) setExampleReference(cat);
  }
  $("refOpacity").disabled = $("viewMode").value !== "trace";
  new ResizeObserver(resize).observe(stage);
  new ResizeObserver(drawReference).observe($("referencePanel"));
  resize();
})();
