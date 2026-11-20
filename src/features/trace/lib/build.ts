import { containsPoint, holeSample, traceMask, type Ring } from "./contour";
import { collapseRing, findCorners, fitRing, segsToNodes } from "./fit";
import type { RawNode, TraceParams } from "./types";

export interface Component {
  outer: Ring;
  holes: Ring[];
}

/**
 * Split one color mask into connected components, each with the holes it
 * contains. Components smaller than minArea are dropped and holes smaller
 * than minArea are filled — that is the despeckle rule shown in the preview.
 * Separate components stay separate shapes and are never merged.
 */
export function buildComponents(
  labels: Int16Array,
  w: number,
  h: number,
  color: number,
  minArea: number,
): Component[] {
  const rings = traceMask(labels, w, h, color);
  const outers = rings.filter((r) => r.area < 0 && -r.area >= minArea);
  const holes = rings.filter((r) => r.area > 0 && r.area >= minArea);
  const owner = (hole: Ring): Ring | undefined => {
    const p = holeSample(hole.pts);
    let best: Ring | undefined;
    for (const o of outers) {
      if (!containsPoint(o.pts, p.x, p.y)) continue;
      if (!best || -o.area < -best.area) best = o;
    }
    return best;
  };
  return outers.map((outer) => ({
    outer,
    holes: holes.filter((hole) => owner(hole) === outer),
  }));
}

/** trace one ring down to editor nodes: collapse -> corners -> budgeted fit */
export function ringToNodes(ring: Ring, params: TraceParams): RawNode[] {
  const poly = collapseRing(ring.pts);
  if (poly.length < 3) return [];
  const corners = findCorners(poly, params.corner);
  const segs = fitRing(poly, corners, params.precision);
  return segsToNodes(segs);
}
