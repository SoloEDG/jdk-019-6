/**
 * Boundary ("crack") following on the pixel-edge grid.
 *
 * Every contour is a closed walk along pixel edges with foreground always
 * on the left. Preferring the leftmost valid turn yields 4-connectivity for
 * foreground (diagonally touching regions of the same color stay separate
 * shapes) and 8-connectivity for background, so thin gaps and holes are
 * traced exactly as the pixels dictate. Tracing along pixel edges (not
 * pixel centers) also means adjacent color layers share the exact same
 * geometric boundary — no gaps or overlaps between layers.
 */

export interface Ring {
  /** flat [x0, y0, x1, y1, ...] integer grid vertices, closed implicitly */
  pts: number[];
  /** signed area; negative = outer boundary, positive = hole */
  area: number;
}

// directions: 0=N 1=E 2=S 3=W (y axis points down)
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
// pixel on the left of an edge leaving (px, py) in direction d
const LX = [-1, 0, 0, -1];
const LY = [-1, -1, 0, 0];
// pixel on the right
const RX = [0, 0, -1, -1];
const RY = [-1, 0, 0, -1];

export function traceMask(
  labels: Int16Array,
  w: number,
  h: number,
  color: number,
): Ring[] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === color;
  const hSize = w * (h + 1);
  const visited = new Uint8Array(hSize + (w + 1) * h);
  const edgeId = (x: number, y: number, d: number) =>
    d === 0
      ? hSize + (y - 1) * (w + 1) + x // vertical edge above the point
      : d === 2
        ? hSize + y * (w + 1) + x // vertical edge below
        : d === 1
          ? y * w + x // horizontal edge to the right
          : y * w + x - 1; // horizontal edge to the left
  const rings: Ring[] = [];
  const maxSteps = 8 * w * h + 16;

  const traceFrom = (sx: number, sy: number, sd: number): Ring => {
    const pts: number[] = [sx, sy];
    visited[edgeId(sx, sy, sd)] = 1;
    let x = sx + DX[sd],
      y = sy + DY[sd],
      d = sd;
    for (let step = 0; ; step++) {
      // pick the leftmost turn that keeps foreground left / background right
      let nd = -1;
      for (const t of [3, 0, 1, 2]) {
        const c = (d + t) & 3;
        if (
          inside(x + LX[c], y + LY[c]) &&
          !inside(x + RX[c], y + RY[c])
        ) {
          nd = c;
          break;
        }
      }
      if (nd < 0 || step > maxSteps) break; // defensive; cannot happen on closed boundaries
      if (x === sx && y === sy && nd === sd) break; // closed the loop
      pts.push(x, y);
      visited[edgeId(x, y, nd)] = 1;
      x += DX[nd];
      y += DY[nd];
      d = nd;
    }
    let area = 0;
    for (let i = 0, n = pts.length / 2; i < n; i++) {
      const j = (i + 1) % n;
      area += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
    }
    return { pts, area: area / 2 };
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] !== color) continue;
      // each boundary side of this pixel maps to one directed edge
      if (!inside(x, y - 1) && !visited[edgeId(x + 1, y, 3)])
        rings.push(traceFrom(x + 1, y, 3)); // top side, heading W
      if (!inside(x + 1, y) && !visited[edgeId(x + 1, y + 1, 0)])
        rings.push(traceFrom(x + 1, y + 1, 0)); // right side, heading N
      if (!inside(x, y + 1) && !visited[edgeId(x, y + 1, 1)])
        rings.push(traceFrom(x, y + 1, 1)); // bottom side, heading E
      if (!inside(x - 1, y) && !visited[edgeId(x, y, 2)])
        rings.push(traceFrom(x, y, 2)); // left side, heading S
    }
  }
  return rings;
}

/** even-odd point-in-ring test; rings are axis-aligned so only vertical edges count */
export function containsPoint(pts: number[], px: number, py: number): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2],
      yi = pts[i * 2 + 1],
      yj = pts[j * 2 + 1];
    if (yi !== yj && yi > py !== yj > py && px < xi) inside = !inside;
  }
  return inside;
}

/** a point strictly inside the hole, derived from its first edge */
export function holeSample(pts: number[]): { x: number; y: number } {
  const dx = Math.sign(pts[2] - pts[0]);
  const dy = Math.sign(pts[3] - pts[1]);
  // hole interior is on the right of the directed edge
  const d = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3;
  return { x: pts[0] + RX[d] + 0.5, y: pts[1] + RY[d] + 0.5 };
}
