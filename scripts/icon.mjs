import zlib from "node:zlib";
function crc32(buffer) {
  let c = 0xffffffff;
  for (const b of buffer) {
    c ^= b;
    for (let n = 0; n < 8; n++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length);
  t.copy(b, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return b;
}
export function makeIcon(size, maskable = false) {
  const raw = Buffer.alloc((size * 4 + 1) * size),
    grid = ["01110", "11000", "10011", "11001", "01110"],
    spacing = size * (maskable ? 0.105 : 0.13),
    radius = spacing * 0.34;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      let color = [16, 9, 18];
      for (let gy = 0; gy < 5; gy++)
        for (let gx = 0; gx < 5; gx++) {
          const cx = size / 2 + (gx - 2) * spacing,
            cy = size / 2 + (gy - 2) * spacing;
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2)
            color =
              grid[gy][gx] === "1"
                ? gx >= 3
                  ? [250, 53, 148]
                  : [255, 252, 228]
                : [60, 36, 63];
        }
      const p = row + 1 + x * 4;
      raw[p] = color[0];
      raw[p + 1] = color[1];
      raw[p + 2] = color[2];
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
