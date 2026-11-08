/* Generic offline bead model. No images, DOM, storage, network or dependencies. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeadCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FORMAT = "bead-playground";
  const VERSION = 1;
  const MIN_SIDE = 8,
    MAX_SIDE = 160,
    MAX_PALETTE = 64;
  const MAX_RASTER_PIXELS = 16 * 1024 * 1024;
  const DEFAULT_PALETTE = Object.freeze([
    "#16151d",
    "#fff7e7",
    "#f7c85c",
    "#ef8d49",
    "#e85a64",
    "#bd5e8c",
    "#8d76c8",
    "#668bd6",
    "#64b6c8",
    "#74bfa1",
    "#aecb78",
    "#a78770",
  ]);

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function isRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function ownKeys(record, allowed, label) {
    assert(isRecord(record), label + " must be a plain object.");
    for (const key of Reflect.ownKeys(record)) {
      assert(
        typeof key === "string" && allowed.includes(key),
        label + " contains an unsupported field.",
      );
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      assert(
        descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value"),
        label + " must not contain accessors.",
      );
    }
  }

  function checkDimensions(width, height) {
    assert(
      Number.isInteger(width) && width >= MIN_SIDE && width <= MAX_SIDE,
      "Width must be an integer from 8 to 160.",
    );
    assert(
      Number.isInteger(height) && height >= MIN_SIDE && height <= MAX_SIDE,
      "Height must be an integer from 8 to 160.",
    );
  }

  function normalizeColor(value) {
    assert(
      typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value),
      "Colors must use six-digit hexadecimal notation, for example #ff9900.",
    );
    return value.toLowerCase();
  }

  function normalizePalette(palette) {
    assert(
      Array.isArray(palette) &&
        palette.length >= 1 &&
        palette.length <= MAX_PALETTE,
      "Palette must contain 1 to 64 colors.",
    );
    return Array.from(palette, normalizeColor);
  }

  // Settings are inert JSON data, with strict depth, size and key limits.
  function copySettings(settings) {
    assert(isRecord(settings), "Settings must be a plain object.");
    const seen = new Set();
    let entries = 0,
      characters = 0;
    function visit(value, depth) {
      assert(
        depth <= 4 && ++entries <= 256,
        "Settings are too large or deeply nested.",
      );
      if (value === null || typeof value === "boolean") return value;
      if (typeof value === "number") {
        assert(Number.isFinite(value), "Settings numbers must be finite.");
        return value;
      }
      if (typeof value === "string") {
        characters += value.length;
        assert(
          value.length <= 512 && characters <= 8192,
          "Settings text is too long.",
        );
        return value;
      }
      assert(
        value && typeof value === "object" && !seen.has(value),
        "Settings must contain only acyclic JSON data.",
      );
      seen.add(value);
      let result;
      if (Array.isArray(value)) {
        assert(
          value.length <= 64,
          "Settings arrays are limited to 64 entries.",
        );
        result = Array.from(value, (item) => visit(item, depth + 1));
      } else {
        assert(isRecord(value), "Settings values must be plain JSON objects.");
        const keys = Reflect.ownKeys(value);
        assert(keys.length <= 64, "Settings objects are limited to 64 fields.");
        result = {};
        for (const key of keys) {
          assert(
            typeof key === "string" &&
              key.length <= 64 &&
              !["__proto__", "prototype", "constructor"].includes(key),
            "Unsupported settings key.",
          );
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          assert(
            descriptor &&
              Object.prototype.hasOwnProperty.call(descriptor, "value"),
            "Settings must not contain accessors.",
          );
          result[key] = visit(descriptor.value, depth + 1);
        }
      }
      seen.delete(value);
      return result;
    }
    return visit(settings, 0);
  }

  /** Return a clean independent project, or throw. Unknown top-level fields are rejected. */
  function validateProject(raw) {
    ownKeys(
      raw,
      ["format", "version", "width", "height", "palette", "cells", "settings"],
      "Project",
    );
    assert(
      raw.format === FORMAT && raw.version === VERSION,
      "Unsupported bead project format or version.",
    );
    checkDimensions(raw.width, raw.height);
    const palette = normalizePalette(raw.palette);
    assert(
      Array.isArray(raw.cells) && raw.cells.length === raw.width * raw.height,
      "Cell count must exactly match width × height.",
    );
    const cells = new Array(raw.cells.length);
    for (let i = 0; i < cells.length; i++) {
      const value = raw.cells[i];
      assert(
        Number.isInteger(value) && value >= -1 && value < palette.length,
        "Each cell must be -1 (empty) or a valid palette index.",
      );
      cells[i] = value;
    }
    const project = {
      format: FORMAT,
      version: VERSION,
      width: raw.width,
      height: raw.height,
      palette,
      cells,
    };
    if (raw.settings !== undefined)
      project.settings = copySettings(raw.settings);
    return project;
  }

  function blank(width, height, palette) {
    checkDimensions(width, height);
    return {
      format: FORMAT,
      version: VERSION,
      width,
      height,
      palette: normalizePalette(
        palette === undefined ? DEFAULT_PALETTE : palette,
      ),
      cells: new Array(width * height).fill(-1),
    };
  }

  function clone(project) {
    return validateProject(project);
  }
  function toHex(rgb) {
    return "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
  }
  function toRGB(hex) {
    const number = parseInt(hex.slice(1), 16);
    return [number >>> 16, (number >>> 8) & 255, number & 255];
  }

  function makeBox(points) {
    let population = 0,
      minKey = 0xffffff;
    const min = [255, 255, 255],
      max = [0, 0, 0];
    for (const point of points) {
      population += point.count;
      minKey = Math.min(minKey, point.key);
      for (let channel = 0; channel < 3; channel++) {
        min[channel] = Math.min(min[channel], point.rgb[channel]);
        max[channel] = Math.max(max[channel], point.rgb[channel]);
      }
    }
    const spans = max.map((value, channel) => value - min[channel]);
    const channel =
      spans[1] > spans[0]
        ? spans[2] > spans[1]
          ? 2
          : 1
        : spans[2] > spans[0]
          ? 2
          : 0;
    return {
      points,
      population,
      minKey,
      channel,
      score: population * spans[channel] * spans[channel],
    };
  }

  // Weighted median-cut: pixel frequency drives splits and representative means.
  // All ties are explicit so identical input yields identical JSON across runs.
  function quantize(points, colorLimit) {
    if (points.length <= colorLimit)
      return points.map((point) => point.rgb.slice());
    const boxes = [makeBox(points)];
    while (boxes.length < colorLimit) {
      let selected = -1;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].points.length < 2) continue;
        if (
          selected === -1 ||
          boxes[i].score > boxes[selected].score ||
          (boxes[i].score === boxes[selected].score &&
            boxes[i].minKey < boxes[selected].minKey)
        )
          selected = i;
      }
      if (selected === -1) break;
      const box = boxes[selected],
        channel = box.channel;
      const sorted = box.points
        .slice()
        .sort((a, b) => a.rgb[channel] - b.rgb[channel] || a.key - b.key);
      let cumulative = 0,
        split = 1;
      for (let i = 0; i < sorted.length - 1; i++) {
        cumulative += sorted[i].count;
        split = i + 1;
        if (cumulative >= box.population / 2) break;
      }
      boxes.splice(
        selected,
        1,
        makeBox(sorted.slice(0, split)),
        makeBox(sorted.slice(split)),
      );
    }
    const palette = boxes.map((box) => {
      const sums = [0, 0, 0];
      for (const point of box.points)
        for (let channel = 0; channel < 3; channel++)
          sums[channel] += point.rgb[channel] * point.count;
      return sums.map((sum) => Math.round(sum / box.population));
    });
    const unique = new Map(
      palette.map((rgb) => [(rgb[0] << 16) | (rgb[1] << 8) | rgb[2], rgb]),
    );
    return Array.from(unique.entries())
      .sort((a, b) => a[0] - b[0])
      .map((entry) => entry[1]);
  }

  /** Convert already-sampled RGBA grid data. Does not resize, load or upload images. */
  function convertRGBA(rgba, width, height, options) {
    checkDimensions(width, height);
    options = options === undefined ? {} : options;
    ownKeys(
      options,
      ["colors", "alphaThreshold", "ignoreNearBlack", "blackThreshold"],
      "Conversion options",
    );
    const colors = options.colors === undefined ? 16 : options.colors;
    const alphaThreshold =
      options.alphaThreshold === undefined ? 80 : options.alphaThreshold;
    const ignoreNearBlack =
      options.ignoreNearBlack === undefined ? false : options.ignoreNearBlack;
    const blackThreshold =
      options.blackThreshold === undefined ? 20 : options.blackThreshold;
    assert(
      Number.isInteger(colors) && colors >= 1 && colors <= 48,
      "Conversion color count must be from 1 to 48.",
    );
    assert(
      Number.isInteger(alphaThreshold) &&
        alphaThreshold >= 0 &&
        alphaThreshold <= 255,
      "Alpha threshold must be from 0 to 255.",
    );
    assert(
      typeof ignoreNearBlack === "boolean",
      "ignoreNearBlack must be a boolean.",
    );
    assert(
      Number.isInteger(blackThreshold) &&
        blackThreshold >= 0 &&
        blackThreshold <= 255,
      "Black threshold must be from 0 to 255.",
    );
    assert(
      (Array.isArray(rgba) ||
        rgba instanceof Uint8Array ||
        rgba instanceof Uint8ClampedArray) &&
        rgba.length === width * height * 4,
      "RGBA input must have exactly width × height × 4 bytes.",
    );
    const histogram = new Map(),
      pixelKeys = new Int32Array(width * height);
    pixelKeys.fill(-1);
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i],
        g = rgba[i + 1],
        b = rgba[i + 2],
        a = rgba[i + 3];
      assert(
        [r, g, b, a].every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 255,
        ),
        "RGBA values must be integer bytes.",
      );
      if (
        a === 0 ||
        a < alphaThreshold ||
        (ignoreNearBlack && Math.max(r, g, b) <= blackThreshold)
      )
        continue;
      const key = (r << 16) | (g << 8) | b;
      pixelKeys[i / 4] = key;
      const previous = histogram.get(key);
      if (previous) previous.count++;
      else histogram.set(key, { key, rgb: [r, g, b], count: 1 });
    }
    if (histogram.size === 0) return blank(width, height, ["#000000"]);
    const points = Array.from(histogram.values()).sort((a, b) => a.key - b.key);
    const palette = quantize(points, colors);
    const mapping = new Map();
    for (const point of points) {
      let bestIndex = 0,
        bestDistance = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const dr = point.rgb[0] - palette[i][0],
          dg = point.rgb[1] - palette[i][1],
          db = point.rgb[2] - palette[i][2];
        const distance = 299 * dr * dr + 587 * dg * dg + 114 * db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }
      mapping.set(point.key, bestIndex);
    }
    const project = blank(width, height, palette.map(toHex));
    project.cells = Array.from(pixelKeys, (key) =>
      key === -1 ? -1 : mapping.get(key),
    );
    return project;
  }

  /** Pixel-exact flat beads. gap is the fraction of each cell left between beads. */
  function rasterize(project, options) {
    const model = validateProject(project);
    options = options === undefined ? {} : options;
    ownKeys(
      options,
      ["cellSize", "gap", "shape", "background", "grid"],
      "Raster options",
    );
    const cellSize = options.cellSize === undefined ? 16 : options.cellSize;
    const gap = options.gap === undefined ? 0.16 : options.gap;
    const shape = options.shape === undefined ? "circle" : options.shape;
    const background =
      options.background === undefined ? "#101016" : options.background;
    const grid = options.grid === undefined ? false : options.grid;
    assert(
      Number.isInteger(cellSize) && cellSize >= 1 && cellSize <= 32,
      "Cell size must be an integer from 1 to 32.",
    );
    assert(
      typeof gap === "number" && Number.isFinite(gap) && gap >= 0 && gap <= 0.9,
      "Gap must be from 0 to 0.9.",
    );
    assert(
      shape === "circle" || shape === "square",
      "Shape must be circle or square.",
    );
    assert(typeof grid === "boolean", "Grid must be a boolean.");
    const transparent = background === "transparent";
    const bg = transparent ? [0, 0, 0] : toRGB(normalizeColor(background));
    const width = model.width * cellSize,
      height = model.height * cellSize;
    assert(
      width * height <= MAX_RASTER_PIXELS,
      "Raster exceeds the 16-megapixel safety limit; use a smaller cell size.",
    );
    const data = new Uint8ClampedArray(width * height * 4);
    if (!transparent)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = bg[0];
        data[i + 1] = bg[1];
        data[i + 2] = bg[2];
        data[i + 3] = 255;
      }
    if (grid)
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (x % cellSize !== 0 && y % cellSize !== 0) continue;
          const i = (y * width + x) * 4;
          data[i] = 60;
          data[i + 1] = 60;
          data[i + 2] = 76;
          data[i + 3] = transparent ? 128 : 255;
        }
    const mask = [],
      radius = (cellSize * (1 - gap)) / 2,
      center = cellSize / 2;
    for (let y = 0; y < cellSize; y++)
      for (let x = 0; x < cellSize; x++) {
        const dx = x + 0.5 - center,
          dy = y + 0.5 - center;
        if (
          shape === "circle"
            ? dx * dx + dy * dy <= radius * radius
            : Math.abs(dx) <= radius && Math.abs(dy) <= radius
        )
          mask.push([x, y]);
      }
    // Tiny preview cells should still visibly represent a bead.
    if (mask.length === 0)
      mask.push([
        Math.floor((cellSize - 1) / 2),
        Math.floor((cellSize - 1) / 2),
      ]);
    const palette = model.palette.map(toRGB);
    for (let cell = 0; cell < model.cells.length; cell++) {
      const colorIndex = model.cells[cell];
      if (colorIndex < 0) continue;
      const rgb = palette[colorIndex],
        left = (cell % model.width) * cellSize,
        top = Math.floor(cell / model.width) * cellSize;
      for (const point of mask) {
        const i = ((top + point[1]) * width + left + point[0]) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    }
    return { width, height, data };
  }

  // Clip before Bresenham so a pointer far beyond the canvas cannot cause a long loop.
  function clipLine(x0, y0, x1, y1, width, height) {
    const dx = x1 - x0,
      dy = y1 - y0;
    let from = 0,
      to = 1;
    const p = [-dx, dx, -dy, dy],
      q = [x0, width - 1 - x0, y0, height - 1 - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
      } else {
        const fraction = q[i] / p[i];
        if (p[i] < 0) from = Math.max(from, fraction);
        else to = Math.min(to, fraction);
        if (from > to) return null;
      }
    }
    const bound = (value, maximum) =>
      Math.max(0, Math.min(maximum, Math.round(value)));
    return [
      bound(x0 + from * dx, width - 1),
      bound(y0 + from * dy, height - 1),
      bound(x0 + to * dx, width - 1),
      bound(y0 + to * dy, height - 1),
    ];
  }

  /** Mutate cells in place; -1 erases. Return the number of cells whose value changed. */
  function paintLine(project, x0, y0, x1, y1, colorIndex) {
    assert(
      isRecord(project) &&
        project.format === FORMAT &&
        project.version === VERSION,
      "Invalid bead project.",
    );
    checkDimensions(project.width, project.height);
    assert(
      Array.isArray(project.cells) &&
        project.cells.length === project.width * project.height &&
        Array.isArray(project.palette) &&
        project.palette.length >= 1 &&
        project.palette.length <= MAX_PALETTE,
      "Invalid project arrays.",
    );
    assert(
      [x0, y0, x1, y1].every(Number.isSafeInteger),
      "Line coordinates must be safe integers.",
    );
    assert(
      Number.isInteger(colorIndex) &&
        colorIndex >= -1 &&
        colorIndex < project.palette.length,
      "Invalid brush color index.",
    );
    const clipped = clipLine(x0, y0, x1, y1, project.width, project.height);
    if (!clipped) return 0;
    [x0, y0, x1, y1] = clipped;
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let error = dx + dy,
      changed = 0;
    while (true) {
      const index = y0 * project.width + x0;
      if (project.cells[index] !== colorIndex) {
        project.cells[index] = colorIndex;
        changed++;
      }
      if (x0 === x1 && y0 === y1) break;
      const twiceError = 2 * error;
      if (twiceError >= dy) {
        error += dy;
        x0 += sx;
      }
      if (twiceError <= dx) {
        error += dx;
        y0 += sy;
      }
    }
    return changed;
  }

  return Object.freeze({
    blank,
    validateProject,
    convertRGBA,
    rasterize,
    clone,
    paintLine,
  });
});
