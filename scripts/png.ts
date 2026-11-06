import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngSize {
  width: number;
  height: number;
}

/** The pixel size from a PNG's IHDR chunk, or null if the bytes are not a PNG. */
export function pngSize(bytes: Buffer): PngSize | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export interface DecodedPng extends PngSize {
  /** The [r, g, b, a] of one pixel. */
  pixel(x: number, y: number): number[];
}

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what `sips` writes). */
export function decodePng(bytes: Buffer): DecodedPng {
  const size = pngSize(bytes);
  if (!size) throw new Error("Not a PNG");
  const depth = bytes.readUInt8(24);
  const colorType = bytes.readUInt8(25);
  const interlace = bytes.readUInt8(28);
  if (depth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0)
    throw new Error("Only 8-bit, non-interlaced RGB/RGBA PNGs are supported");
  const channels = colorType === 6 ? 4 : 3;

  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") data.push(bytes.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));

  const { width, height } = size;
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    for (let i = 0; i < stride; i++) {
      const value = raw[y * (stride + 1) + 1 + i] as number;
      const left =
        i >= channels ? (out[y * stride + i - channels] as number) : 0;
      const up = y > 0 ? (out[(y - 1) * stride + i] as number) : 0;
      const upLeft =
        y > 0 && i >= channels
          ? (out[(y - 1) * stride + i - channels] as number)
          : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[y * stride + i] = (value + predicted) & 0xff;
    }
  }
  return {
    width,
    height,
    pixel: (x, y) => {
      const at = y * stride + x * channels;
      return [
        out[at] as number,
        out[at + 1] as number,
        out[at + 2] as number,
        channels === 4 ? (out[at + 3] as number) : 255,
      ];
    },
  };
}
