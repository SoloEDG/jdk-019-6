/**
 * Robustness & performance checks for the tracing pipeline:
 *   npx esbuild scripts/stress.test.ts --bundle --format=esm --platform=node \
 *     --outfile=/tmp/stress-test.mjs && node /tmp/stress-test.mjs
 */
import { runPipeline } from "../src/features/trace/lib/pipeline";
import type { TraceParams } from "../src/features/trace/lib/types";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log("  ok -", msg);
  else {
    failures++;
    console.error("  FAIL -", msg);
  }
};

const base: TraceParams = {
  colors: 2,
  denoise: 0,
  precision: 1,
  minArea: 4,
  corner: 60,
  ignored: [],
  ignoreAuto: true,
};

function canvas(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const paint = (x0: number, y0: number, x1: number, y1: number, v: 0 | 255) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
  };
  return { data, paint, w, h };
}

// 1px gap stays a gap; touching squares merge
{
  const { data, paint, w, h } = canvas(60, 40);
  paint(5, 5, 20, 20, 0);
  paint(21, 5, 36, 20, 0); // 1px gap
  paint(5, 25, 20, 38, 0);
  paint(20, 25, 35, 38, 0); // touching
  const r = runPipeline({ width: w, height: h, data, params: base }, () => {});
  ok(r.shapes.length === 3, `1px gap separates, touching merges (got ${r.shapes.length})`);
}

// 1px thin line survives as a shape
{
  const { data, paint, w, h } = canvas(60, 40);
  paint(5, 20, 55, 21, 0);
  const r = runPipeline({ width: w, height: h, data, params: base }, () => {});
  ok(r.shapes.length === 1 && r.shapes[0].ring.length <= 6, "1px line traced with few nodes");
}

// nested rings: hole ownership across three levels
{
  const { data, paint, w, h } = canvas(60, 60);
  paint(5, 5, 55, 55, 0);
  paint(12, 12, 48, 48, 255);
  paint(20, 20, 40, 40, 0);
  paint(26, 26, 34, 34, 255);
  paint(28, 28, 32, 32, 0);
  const r = runPipeline({ width: w, height: h, data, params: base }, () => {});
  const byArea = [...r.shapes].sort((a, b) => b.area - a.area);
  ok(r.shapes.length === 3, `three nesting levels -> three shapes (got ${r.shapes.length})`);
  ok(
    byArea[0].holes.length === 1 && byArea[1].holes.length === 1 && byArea[2].holes.length === 0,
    "holes attach to the immediately containing ring",
  );
}

// noisy photo-like image: denoise + despeckle keep one clean circle
{
  const w = 240,
    h = 240;
  const { data, paint } = canvas(w, h);
  // filled circle radius 80
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if ((x - 120) ** 2 + (y - 120) ** 2 < 80 ** 2) paint(x, y, x + 1, y + 1, 0);
  // 4% salt noise
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < w * h * 0.04; i++) {
    const x = Math.floor(rnd() * w),
      y = Math.floor(rnd() * h);
    paint(x, y, x + 1, y + 1, 0);
  }
  const t0 = Date.now();
  const r = runPipeline(
    {
      width: w,
      height: h,
      data,
      params: { ...base, denoise: 1, minArea: 30, precision: 1.5 },
    },
    () => {},
  );
  const ms = Date.now() - t0;
  console.log(`  noisy 240px image traced in ${ms}ms, ${r.shapes.length} shapes, ${r.nodes} nodes`);
  ok(r.shapes.length <= 6, `noise despeckled to few shapes (got ${r.shapes.length})`);
  ok(r.nodes < 400, `noise does not explode node count (got ${r.nodes})`);
  ok(ms < 5000, "fast enough");
}

// large image performance
{
  const w = 1200,
    h = 900;
  const { data, paint } = canvas(w, h);
  for (let k = 0; k < 40; k++)
    paint((k * 97) % 1100, (k * 61) % 820, ((k * 97) % 1100) + 60, ((k * 61) % 820) + 40, 0);
  const t0 = Date.now();
  const r = runPipeline({ width: w, height: h, data, params: base }, () => {});
  const ms = Date.now() - t0;
  console.log(`  1200x900 with 40 rects: ${ms}ms, ${r.shapes.length} shapes, ${r.nodes} nodes`);
  ok(r.shapes.length >= 30, "all rects traced");
  ok(ms < 5000, `large image fast enough (${ms}ms)`);
}

// single-color image: nothing to trace, no crash
{
  const { data, w, h } = canvas(30, 30);
  const r = runPipeline({ width: w, height: h, data, params: base }, () => {});
  ok(r.shapes.length === 0, "single-color image yields no shapes");
}

console.log(failures ? `\n${failures} FAILURES` : "\nstress tests passed");
process.exit(failures ? 1 : 0);
