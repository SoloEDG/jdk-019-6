/**
 * Unit test for the tracing pipeline, run with:
 *   npx esbuild scripts/trace.test.ts --bundle --format=esm --platform=node \
 *     --outfile=/tmp/trace-test.mjs && node /tmp/trace-test.mjs
 */
import { runPipeline } from "../src/features/trace/lib/pipeline";
import { findCorners, fitRing, segsToNodes } from "../src/features/trace/lib/fit";
import type { Pt, TraceParams } from "../src/features/trace/lib/types";

const W = 80,
  H = 80;
const data = new Uint8ClampedArray(W * H * 4);

function paint(x0: number, y0: number, x1: number, y1: number, rgba: number[]) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
}

const WHITE = [255, 255, 255, 255];
const BLACK = [20, 20, 20, 255];
const RED = [220, 40, 40, 255];
const CLEAR = [0, 0, 0, 0];

paint(0, 0, W, H, WHITE);
// black ring: outer (10,10)-(50,50)
paint(10, 10, 50, 50, BLACK);
// white hole 10x10 -> kept (100 >= minArea)
paint(20, 20, 30, 30, WHITE);
// black island 4x4 inside that hole -> separate shape (16 >= minArea)
paint(22, 22, 26, 26, BLACK);
// transparent hole 7x7 -> kept (49 >= minArea)
paint(35, 35, 42, 42, CLEAR);
// tiny white hole 2x2 -> filled (4 < minArea)
paint(44, 44, 46, 46, WHITE);
// tiny black speck 2x2 -> dropped (4 < minArea)
paint(60, 30, 62, 32, BLACK);
// isolated black square 10x10 -> must stay a separate shape
paint(60, 10, 70, 20, BLACK);
// black filled diamond (staircase edges, sharp tips)
for (let dy = -10; dy <= 10; dy++) {
  const r = 10 - Math.abs(dy);
  paint(15 - r, 64 + dy, 16 + r, 65 + dy, BLACK);
}
// red square
paint(60, 60, 70, 70, RED);

const params: TraceParams = {
  colors: 3,
  denoise: 0,
  precision: 1,
  minArea: 8,
  corner: 60,
  ignored: [],
  ignoreAuto: true,
};

const result = runPipeline(
  { width: W, height: H, data, params },
  () => {},
);

let failures = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log("  ok -", msg);
  else {
    failures++;
    console.error("  FAIL -", msg);
  }
}

// image (x,y) -> artboard: scale 6.5, offset (140, 40)
const bx = (x: number) => x * 6.5 + 140;
const by = (y: number) => y * 6.5 + 40;

console.log("palette:", result.palette, "background:", result.background);
ok(result.palette.length === 3, "palette merges to 3 colors");
ok(
  result.background >= 0 && result.palette[result.background] === "#ffffff",
  "white corner color auto-detected as background",
);

const black = result.shapes.filter((s) => {
  const v = parseInt(s.fill.slice(1), 16);
  return (v >> 16) < 90 && ((v >> 8) & 255) < 90 && (v & 255) < 90;
});
const red = result.shapes.filter((s) => s.fill.startsWith("#d"));
console.log(
  "shapes:",
  result.shapes.map((s) => `${s.fill} ring=${s.ring.length} holes=${s.holes.length} area=${s.area}`),
);
ok(result.shapes.length === 5, `5 shapes total (got ${result.shapes.length})`);
ok(black.length === 4, "4 black components: ring, island, square, diamond");
ok(red.length === 1, "1 red component");

const ring = black.find((s) => s.holes.length > 0);
ok(!!ring, "ring component exists");
ok(ring!.holes.length === 2, "ring keeps the white hole and the transparent hole");
ok(
  ring!.holes.every((h) => h.length >= 4),
  "hole rings have real nodes",
);

const square = black.find(
  (s) => !s.holes.length && s.area > 80 && s.area < 120 && s.ring.every((n) => n.x > 500),
);
ok(!!square, "isolated black square is its own shape (not merged into the ring)");
ok(square!.ring.length === 4, `square keeps 4 corner nodes (got ${square!.ring.length})`);
ok(
  square!.ring.some((n) => Math.abs(n.x - bx(60)) < 1 && Math.abs(n.y - by(10)) < 1) &&
    square!.ring.some((n) => Math.abs(n.x - bx(70)) < 1 && Math.abs(n.y - by(20)) < 1),
  "square corners land on the pixel boundary",
);

const diamond = black.find(
  (s) => !s.holes.length && s.area > 200 && s.area < 240,
);
ok(!!diamond, "diamond component exists");
ok(
  diamond!.ring.length <= 8,
  `diamond staircase edges simplify to few nodes (got ${diamond!.ring.length})`,
);
ok(
  [
    [15, 54],
    [15, 74],
    [5, 64],
    [25, 64],
  ].every(([x, y]) =>
    diamond!.ring.some((n) => Math.hypot(n.x - bx(x), n.y - by(y)) < 8),
  ),
  "diamond tips stay sharp within the error budget",
);

const island = black.find((s) => s.area >= 15 && s.area <= 17);
ok(!!island, "island inside the hole is a separate shape, not a hole of a hole");

ok(
  result.shapes.every((s) =>
    [...s.ring, ...s.holes.flat()].every(
      (n) =>
        [n.x, n.y, n.ix, n.iy, n.ox, n.oy].every(Number.isFinite) &&
        n.x >= 0 &&
        n.x <= 800 &&
        n.y >= 0 &&
        n.y <= 600,
    ),
  ),
  "all nodes and handles finite and on the artboard",
);

// error budget: looser precision must not use more nodes
const loose = runPipeline(
  {
    width: W,
    height: H,
    data,
    params: { ...params, precision: 3 },
  },
  () => {},
);
const tight = runPipeline(
  {
    width: W,
    height: H,
    data,
    params: { ...params, precision: 0.3 },
  },
  () => {},
);
console.log("nodes: tight", tight.nodes, "default", result.nodes, "loose", loose.nodes);
ok(
  loose.nodes <= result.nodes && result.nodes <= tight.nodes,
  "node count follows the error budget",
);

// stacking: largest color layer first, larger regions first within a layer
ok(
  result.shapes[0].area >= result.shapes[result.shapes.length - 1].area,
  "shapes stacked large-first for correct layering",
);

// single-corner closed ring (teardrop): the loop must survive fitting
{
  const poly: Pt[] = [];
  for (let a = 64; a <= 296; a += 6) {
    const t = (a * Math.PI) / 180;
    poly.push({ x: 20 * Math.cos(t), y: 20 * Math.sin(t) });
  }
  poly.push({ x: 45, y: 0 }); // tangent tip: the only sharp corner
  const corners = findCorners(poly, 60);
  const segs = fitRing(poly, corners, 1);
  ok(
    corners.filter(Boolean).length === 1,
    `teardrop has exactly one corner (got ${corners.filter(Boolean).length})`,
  );
  ok(segs.length >= 2, `single-corner loop still fits (got ${segs.length} segments)`);
  const nodes = segsToNodes(segs);
  ok(
    nodes.some((n) => Math.hypot(n.x - 45, n.y) < 1.5),
    "the tip survives as a node",
  );
}

console.log(failures ? `\n${failures} FAILURES` : "\nall tests passed");
process.exit(failures ? 1 : 0);
