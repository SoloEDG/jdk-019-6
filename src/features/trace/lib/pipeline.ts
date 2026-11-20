import { blur } from "./blur";
import { buildComponents, ringToNodes } from "./build";
import { assign, buildPalette, detectBackground, hex } from "./quantize";
import type { RawShape, TraceJob, TraceResult } from "./types";

/** artboard the traced artwork is fitted into */
const BOARD_W = 800;
const BOARD_H = 600;
const MARGIN = 40;

export function runPipeline(
  job: TraceJob,
  progress: (stage: string, pct: number) => void,
): TraceResult {
  const t0 = Date.now();
  const { width: w, height: h, params } = job;

  progress("denoise", 0.05);
  const data = blur(job.data, w, h, params.denoise);
  progress("quantize", 0.25);
  const palette = buildPalette(data, params.colors);
  progress("assign", 0.45);
  const labels = assign(data, palette);
  const background = detectBackground(labels, w, h, palette.length);

  const ignored = new Set(params.ignored);
  if (params.ignoreAuto && background >= 0) ignored.add(background);

  const shapes: RawShape[] = [];
  let nodes = 0;
  for (let color = 0; color < palette.length; color++) {
    if (ignored.has(color)) continue;
    progress("contours", 0.5 + (0.3 * color) / Math.max(1, palette.length));
    for (const comp of buildComponents(labels, w, h, color, params.minArea)) {
      const ring = ringToNodes(comp.outer, params);
      if (!ring.length) continue;
      const holes = comp.holes
        .map((hole) => ringToNodes(hole, params))
        .filter((r) => r.length);
      shapes.push({
        color,
        fill: hex(palette[color]),
        area: -comp.outer.area,
        ring,
        holes,
      });
    }
  }

  progress("curves", 0.85);
  // fit the artwork onto the artboard, centered
  const scale = Math.min((BOARD_W - 2 * MARGIN) / w, (BOARD_H - 2 * MARGIN) / h);
  const ox = (BOARD_W - w * scale) / 2;
  const oy = (BOARD_H - h * scale) / 2;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  for (const s of shapes) {
    for (const n of [...s.ring, ...s.holes.flat()]) {
      n.x = r2(n.x * scale + ox);
      n.y = r2(n.y * scale + oy);
      n.ix = r2(n.ix * scale + ox);
      n.iy = r2(n.iy * scale + oy);
      n.ox = r2(n.ox * scale + ox);
      n.oy = r2(n.oy * scale + oy);
    }
    nodes += s.ring.length + s.holes.reduce((a, hh) => a + hh.length, 0);
  }

  // stack by color and spatial extent: largest color layer at the bottom,
  // larger regions below smaller ones inside each layer
  const layerArea = new Map<number, number>();
  for (const s of shapes)
    layerArea.set(s.color, (layerArea.get(s.color) ?? 0) + s.area);
  shapes.sort(
    (a, b) =>
      (layerArea.get(b.color) ?? 0) - (layerArea.get(a.color) ?? 0) ||
      b.area - a.area,
  );

  progress("done", 1);
  return {
    palette: palette.map(hex),
    background,
    shapes,
    nodes,
    ms: Date.now() - t0,
  };
}
