/**
 * Separable box blur with premultiplied alpha, used as a denoising
 * pre-filter before quantization. radius 0 returns the input untouched.
 */
export function blur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): Uint8ClampedArray {
  const r = Math.round(radius);
  if (r <= 0) return data;
  const n = w * h * 4;
  const src = new Float32Array(n);
  for (let i = 0; i < n; i += 4) {
    const a = data[i + 3] / 255;
    src[i] = data[i] * a;
    src[i + 1] = data[i + 1] * a;
    src[i + 2] = data[i + 2] * a;
    src[i + 3] = data[i + 3];
  }
  const tmp = new Float32Array(n);
  const out = new Float32Array(n);
  const size = 2 * r + 1;
  // horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    const acc = [0, 0, 0, 0];
    for (let x = -r; x <= r; x++) {
      const xx = Math.min(w - 1, Math.max(0, x));
      for (let c = 0; c < 4; c++) acc[c] += src[row + xx * 4 + c];
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) tmp[row + x * 4 + c] = acc[c] / size;
      const add = Math.min(w - 1, x + r + 1);
      const del = Math.max(0, x - r);
      for (let c = 0; c < 4; c++)
        acc[c] += src[row + add * 4 + c] - src[row + del * 4 + c];
    }
  }
  // vertical pass
  for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0];
    for (let y = -r; y <= r; y++) {
      const yy = Math.min(h - 1, Math.max(0, y));
      for (let c = 0; c < 4; c++) acc[c] += tmp[(yy * w + x) * 4 + c];
    }
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = acc[c] / size;
      const add = Math.min(h - 1, y + r + 1);
      const del = Math.max(0, y - r);
      for (let c = 0; c < 4; c++)
        acc[c] += tmp[(add * w + x) * 4 + c] - tmp[(del * w + x) * 4 + c];
    }
  }
  const res = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i += 4) {
    const a = out[i + 3];
    res[i + 3] = a;
    if (a > 0.5) {
      const k = 255 / a;
      res[i] = out[i] * k;
      res[i + 1] = out[i + 1] * k;
      res[i + 2] = out[i + 2] * k;
    }
  }
  return res;
}
