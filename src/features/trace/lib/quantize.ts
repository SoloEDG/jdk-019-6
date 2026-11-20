export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hex(c: RGB): string {
  const p = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`;
}

/**
 * Median-cut color quantization. Pixels with alpha < 128 are ignored
 * (they stay transparent / background). Large images are sampled.
 */
export function buildPalette(data: Uint8ClampedArray, k: number): RGB[] {
  const total = data.length / 4;
  const stride = Math.max(1, Math.floor(total / 120000));
  const samples: number[] = [];
  for (let i = 0; i < total; i += stride) {
    if (data[i * 4 + 3] >= 128)
      samples.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  const count = samples.length / 3;
  if (!count) return [];
  const at = (idx: number, c: number) => samples[idx * 3 + c];
  let boxes: number[][] = [Array.from({ length: count }, (_, i) => i)];
  while (boxes.length < k) {
    let pick = -1;
    let pickChan = 0;
    let pickRange = 0;
    for (let b = 0; b < boxes.length; b++) {
      if (boxes[b].length < 2) continue;
      const lo = [255, 255, 255];
      const hi = [0, 0, 0];
      for (const i of boxes[b])
        for (let c = 0; c < 3; c++) {
          const v = at(i, c);
          if (v < lo[c]) lo[c] = v;
          if (v > hi[c]) hi[c] = v;
        }
      for (let c = 0; c < 3; c++) {
        const range = hi[c] - lo[c];
        if (range > pickRange) {
          pickRange = range;
          pick = b;
          pickChan = c;
        }
      }
    }
    if (pick < 0) break; // every box is a single color
    const box = boxes[pick];
    box.sort((a, b) => at(a, pickChan) - at(b, pickChan));
    // split where within-box variance is minimized: small color populations
    // (logo accents) get their own box instead of being averaged away
    let sum = 0,
      sum2 = 0;
    for (const i of box) {
      const v = at(i, pickChan);
      sum += v;
      sum2 += v * v;
    }
    let best = -1,
      bestCost = Infinity,
      lsum = 0,
      lsum2 = 0;
    for (let i = 0; i < box.length - 1; i++) {
      const v = at(box[i], pickChan);
      lsum += v;
      lsum2 += v * v;
      if (at(box[i + 1], pickChan) === v) continue;
      const nl = i + 1,
        nr = box.length - nl;
      const rsum = sum - lsum,
        rsum2 = sum2 - lsum2;
      const cost = lsum2 - (lsum * lsum) / nl + (rsum2 - (rsum * rsum) / nr);
      if (cost < bestCost) {
        bestCost = cost;
        best = nl;
      }
    }
    if (best < 0) break;
    boxes[pick] = box.slice(0, best);
    boxes.push(box.slice(best));
  }
  // most populous boxes first so palette order is stable and meaningful
  boxes = boxes.sort((a, b) => b.length - a.length);
  return boxes.map((box) => {
    let r = 0,
      g = 0,
      b = 0;
    for (const i of box) {
      r += at(i, 0);
      g += at(i, 1);
      b += at(i, 2);
    }
    return { r: r / box.length, g: g / box.length, b: b / box.length };
  });
}

/** nearest-palette label per pixel; -1 = transparent */
export function assign(data: Uint8ClampedArray, palette: RGB[]): Int16Array {
  const n = data.length / 4;
  const labels = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) {
      labels[i] = -1;
      continue;
    }
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    let best = 0,
      bd = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const c = palette[p];
      const dr = r - c.r,
        dg = g - c.g,
        db = b - c.b;
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    labels[i] = best;
  }
  return labels;
}

/** majority palette index near the four corners; -1 if corners are transparent */
export function detectBackground(
  labels: Int16Array,
  w: number,
  h: number,
  k: number,
): number {
  const counts = new Array<number>(k).fill(0);
  const s = Math.max(2, Math.floor(Math.min(w, h) / 32));
  const corners = [
    [0, 0],
    [w - s, 0],
    [0, h - s],
    [w - s, h - s],
  ];
  for (const [cx, cy] of corners)
    for (let y = cy; y < cy + s; y++)
      for (let x = cx; x < cx + s; x++) {
        const l = labels[y * w + x];
        if (l >= 0) counts[l]++;
      }
  let best = -1,
    bc = 0;
  counts.forEach((c, i) => {
    if (c > bc) {
      bc = c;
      best = i;
    }
  });
  return best;
}
