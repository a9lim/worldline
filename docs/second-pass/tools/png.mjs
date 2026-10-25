// A small PNG reader and writer on node:zlib, for shots-diff.mjs and cvd.mjs.
// decodePng reads non-interlaced 8-bit PNGs of every colour type (what Chrome writes) into RGBA;
// encodePng writes 8-bit RGBA. Nothing else, no dependencies.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** @returns {{ width: number, height: number, data: Uint8Array }} data is RGBA, row-major. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || !(type in CHANNELS)) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const bpp = CHANNELS[type], stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x];
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let r;
      switch (f) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error('bad PNG filter ' + f);
      }
      px[dst + x] = r & 255;
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++) {
    const o = i * 4, s = i * bpp;
    switch (type) {
      case 6: data[o] = px[s]; data[o + 1] = px[s + 1]; data[o + 2] = px[s + 2]; data[o + 3] = px[s + 3]; break;
      case 2: data[o] = px[s]; data[o + 1] = px[s + 1]; data[o + 2] = px[s + 2]; data[o + 3] = 255; break;
      case 0: data[o] = data[o + 1] = data[o + 2] = px[s]; data[o + 3] = 255; break;
      case 4: data[o] = data[o + 1] = data[o + 2] = px[s]; data[o + 3] = px[s + 1]; break;
      case 3: { const k = px[s] * 3; data[o] = palette[k]; data[o + 1] = palette[k + 1]; data[o + 2] = palette[k + 2]; data[o + 3] = trns && px[s] < trns.length ? trns[px[s]] : 255; break; }
    }
  }
  return { width: w, height: h, data };
}

let CRC = null;
function crc32(buf) {
  if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(kind, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(kind, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** @param {{ width: number, height: number, data: Uint8Array }} img RGBA */
export function encodePng({ width, height, data }) {
  const stride = width * 4, raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {            // filter 1 (Sub): flat areas compress well
    const o = y * (stride + 1), s = y * stride;
    raw[o] = 1;
    for (let x = 0; x < stride; x++) raw[o + 1 + x] = (data[s + x] - (x >= 4 ? data[s + x - 4] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

export const readPng = (file) => decodePng(readFileSync(file));
export const writePng = (file, img) => writeFileSync(file, encodePng(img));

/** Box-average downscale to `width` px wide, for thumbnails. */
export function shrink(img, width) {
  const k = img.width / width, height = Math.max(1, Math.round(img.height / k));
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * k), y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * k), x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let r = 0, g = 0, b = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.width + xx) * 4;
        r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
      }
      const n = (y1 - y0) * (x1 - x0), o = (y * width + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
