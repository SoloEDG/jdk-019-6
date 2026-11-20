import type { Pt, RawNode } from "./types";

export interface Seg {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const norm = (a: Pt): Pt => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** merge runs of unit grid steps into straight segments; returns corner vertices */
export function collapseRing(pts: number[]): Pt[] {
  const n = pts.length / 2;
  const key = (i: number) => {
    const j = (i + 1) % n;
    return (
      (Math.sign(pts[j * 2] - pts[i * 2]) + 1) * 3 +
      (Math.sign(pts[j * 2 + 1] - pts[i * 2 + 1]) + 1)
    );
  };
  const keys = new Int8Array(n);
  for (let i = 0; i < n; i++) keys[i] = key(i);
  let start = 0;
  while (start < n && keys[(start + n - 1) % n] === keys[start]) start++;
  const poly: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (keys[i] !== keys[(i + n - 1) % n])
      poly.push({ x: pts[i * 2], y: pts[i * 2 + 1] });
  }
  return poly;
}

/**
 * Windowed turn detection (potrace-style): sums of unit segment directions
 * over a few segments on each side smooth out pixel staircases, so only
 * genuine sharp turns score high. Non-maximum suppression over the same
 * window keeps a true spike from casting false corners onto its neighbors.
 */
export function findCorners(poly: Pt[], thresholdDeg: number): boolean[] {
  const n = poly.length;
  const corner = new Array<boolean>(n).fill(false);
  const w = Math.max(1, Math.min(4, n >> 1));
  const turn = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let ax = 0,
      ay = 0,
      bx = 0,
      by = 0;
    // unit segment directions, so one long straight edge cannot dominate
    for (let k = 1; k <= w; k++) {
      const p0 = poly[(i - k + n) % n],
        p1 = poly[(i - k + 1 + n) % n];
      const d1 = norm(sub(p1, p0));
      ax += d1.x;
      ay += d1.y;
      const q0 = poly[(i + k - 1) % n],
        q1 = poly[(i + k) % n];
      const d2 = norm(sub(q1, q0));
      bx += d2.x;
      by += d2.y;
    }
    const la = Math.hypot(ax, ay),
      lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) {
      turn[i] = 180;
      continue;
    }
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    turn[i] = (Math.acos(cos) * 180) / Math.PI;
  }
  for (let i = 0; i < n; i++) {
    if (turn[i] < thresholdDeg) continue;
    let peak = true;
    for (let k = 1; k <= w && peak; k++) {
      if (
        turn[(i - k + n) % n] > turn[i] ||
        turn[(i + k) % n] > turn[i]
      )
        peak = false;
    }
    corner[i] = peak;
  }
  return corner;
}

function chordParam(pts: Pt[]): number[] {
  const u = new Array<number>(pts.length).fill(0);
  for (let i = 1; i < pts.length; i++) u[i] = u[i - 1] + dist(pts[i], pts[i - 1]);
  const total = u[u.length - 1];
  if (total > 1e-9) for (let i = 1; i < u.length; i++) u[i] /= total;
  else for (let i = 1; i < u.length; i++) u[i] = i / (u.length - 1);
  return u;
}

function evalBez(s: Seg, u: number): Pt {
  const v = 1 - u;
  const b0 = v * v * v,
    b1 = 3 * u * v * v,
    b2 = 3 * u * u * v,
    b3 = u * u * u;
  return {
    x: s.p0.x * b0 + s.c1.x * b1 + s.c2.x * b2 + s.p1.x * b3,
    y: s.p0.y * b0 + s.c1.y * b1 + s.c2.y * b2 + s.p1.y * b3,
  };
}

/** least-squares cubic with fixed endpoints and end tangents (Schneider) */
function generate(pts: Pt[], u: number[], t1: Pt, t2: Pt): Seg {
  const p0 = pts[0],
    p3 = pts[pts.length - 1];
  let a11 = 0,
    a12 = 0,
    a22 = 0,
    x1 = 0,
    x2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const uu = u[i],
      v = 1 - uu;
    const b0 = v * v * v,
      b1 = 3 * uu * v * v,
      b2 = 3 * uu * uu * v,
      b3 = uu * uu * uu;
    const a1x = b1 * t1.x,
      a1y = b1 * t1.y;
    const a2x = -b2 * t2.x,
      a2y = -b2 * t2.y;
    a11 += a1x * a1x + a1y * a1y;
    a12 += a1x * a2x + a1y * a2y;
    a22 += a2x * a2x + a2y * a2y;
    const cx = pts[i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3));
    const cy = pts[i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3));
    x1 += a1x * cx + a1y * cy;
    x2 += a2x * cx + a2y * cy;
  }
  const det = a11 * a22 - a12 * a12;
  let al1 = 0,
    al2 = 0;
  if (det > 1e-12) {
    al1 = (x1 * a22 - x2 * a12) / det;
    al2 = (a11 * x2 - a12 * x1) / det;
  }
  const chord = dist(p0, p3);
  if (!(al1 > 1e-6) || !(al2 > 1e-6) || al1 > chord * 2 || al2 > chord * 2) {
    al1 = al2 = chord / 3;
  }
  return {
    p0,
    c1: { x: p0.x + t1.x * al1, y: p0.y + t1.y * al1 },
    c2: { x: p3.x - t2.x * al2, y: p3.y - t2.y * al2 },
    p1: p3,
  };
}

function maxError(pts: Pt[], u: number[], bez: Seg): { error: number; split: number } {
  let error = 0,
    split = pts.length >> 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const b = evalBez(bez, u[i]);
    const d = (b.x - pts[i].x) ** 2 + (b.y - pts[i].y) ** 2;
    if (d > error) {
      error = d;
      split = i;
    }
  }
  return { error, split };
}

function lineSeg(p0: Pt, p1: Pt): Seg {
  return {
    p0,
    c1: { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 },
    c2: { x: p0.x + ((p1.x - p0.x) * 2) / 3, y: p0.y + ((p1.y - p0.y) * 2) / 3 },
    p1,
  };
}

/**
 * Douglas-Peucker polyline simplification: vertices are kept only when they
 * deviate from the current chord by more than eps — an error budget, not a
 * fixed sampling interval. Pixel staircases collapse to their chord; genuine
 * wiggles survive.
 */
export function simplifyDP(pts: Pt[], eps: number): Pt[] {
  const n = pts.length;
  if (n <= 2) return pts;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const p0 = pts[a],
      p1 = pts[b];
    const dx = p1.x - p0.x,
      dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    let dmax = 0,
      idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d =
        len < 1e-9
          ? dist(pts[i], p0)
          : Math.abs((pts[i].x - p0.x) * dy - (pts[i].y - p0.y) * dx) / len;
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax > eps && idx > 0) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Fit cubics under an error budget: a segment is accepted only when its worst
 * deviation from the digitized points is within eps; otherwise the run splits
 * at the worst point and both halves are refit. This spends nodes exactly
 * where the shape demands them instead of sampling at fixed intervals.
 */
function fit(
  pts: Pt[],
  u: number[],
  t1: Pt,
  t2: Pt,
  eps: number,
  out: Seg[],
  depth: number,
): void {
  const bez = generate(pts, u, t1, t2);
  const { error, split } = maxError(pts, u, bez);
  if (error <= eps * eps || depth >= 24 || pts.length <= 3) {
    out.push(bez);
    return;
  }
  const tc = norm(
    sub(pts[Math.min(split + 1, pts.length - 1)], pts[Math.max(split - 1, 0)]),
  );
  const left = pts.slice(0, split + 1);
  const right = pts.slice(split);
  fit(left, chordParam(left), t1, { x: -tc.x, y: -tc.y }, eps, out, depth + 1);
  fit(right, chordParam(right), tc, t2, eps, out, depth + 1);
}

function fitRun(pts: Pt[], t1: Pt, t2: Pt, eps: number, out: Seg[]): void {
  if (pts.length < 2) return;
  // two budgeted stages: polygonal simplification, then curve fitting —
  // worst-case deviation stays within ~2x the precision budget
  const sp = simplifyDP(pts, eps);
  if (sp.length === 2) {
    out.push(lineSeg(sp[0], sp[1]));
    return;
  }
  fit(sp, chordParam(sp), t1, t2, eps, out, 0);
}

function sliceWrap(poly: Pt[], a: number, b: number): Pt[] {
  return b >= a
    ? poly.slice(a, b + 1)
    : [...poly.slice(a), ...poly.slice(0, b + 1)];
}

function farthest(poly: Pt[], from: number): number {
  let best = from,
    bd = -1;
  for (let i = 0; i < poly.length; i++) {
    const d = (poly[i].x - poly[from].x) ** 2 + (poly[i].y - poly[from].y) ** 2;
    if (d > bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** fit a closed ring: split at sharp corners, smooth-fit the runs between them */
export function fitRing(poly: Pt[], corner: boolean[], eps: number): Seg[] {
  const n = poly.length;
  const segs: Seg[] = [];
  const idx: number[] = [];
  corner.forEach((c, i) => {
    if (c) idx.push(i);
  });
  if (!idx.length) {
    // no corners: cut the ring at two far-apart points with smooth joints
    const b = farthest(poly, 0);
    const a = farthest(poly, b);
    const tan = (i: number) =>
      norm(sub(poly[(i + 1) % n], poly[(i - 1 + n) % n]));
    const ta = tan(a),
      tb = tan(b);
    fitRun(sliceWrap(poly, a, b), ta, { x: -tb.x, y: -tb.y }, eps, segs);
    fitRun(sliceWrap(poly, b, a), tb, { x: -ta.x, y: -ta.y }, eps, segs);
    return segs;
  }
  for (let k = 0; k < idx.length; k++) {
    const from = idx[k],
      to = idx[(k + 1) % idx.length];
    // a single corner: the run is the whole loop back to that corner
    const run =
      to === from
        ? [...poly.slice(from), ...poly.slice(0, from + 1)]
        : sliceWrap(poly, from, to);
    const t1 = norm(sub(poly[(from + 1) % n], poly[from]));
    const t2 = norm(sub(poly[to], poly[(to - 1 + n) % n]));
    fitRun(run, t1, t2, eps, segs);
  }
  return segs;
}

/** segments -> editor nodes (anchor + in/out handles) */
export function segsToNodes(segs: Seg[]): RawNode[] {
  const m = segs.length;
  return segs.map((s, i) => {
    const prev = segs[(i - 1 + m) % m];
    return {
      x: s.p0.x,
      y: s.p0.y,
      ix: prev.c2.x,
      iy: prev.c2.y,
      ox: s.c1.x,
      oy: s.c1.y,
    };
  });
}
