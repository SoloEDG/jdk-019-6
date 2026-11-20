import type { Node, Shape } from "../../../shared/types";
function ring(nodes: Node[]) {
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i <= nodes.length; i++) {
    const a = nodes[i - 1],
      b = nodes[i % nodes.length];
    d += ` C ${a.out.x} ${a.out.y} ${b.in.x} ${b.in.y} ${b.x} ${b.y}`;
  }
  return d + " Z";
}
export function path(s: Shape) {
  if (!s.nodes.length) return "";
  let d = `M ${s.nodes[0].x} ${s.nodes[0].y}`;
  const n = s.nodes;
  for (let i = 1; i < n.length + (s.closed ? 1 : 0); i++) {
    const a = n[i - 1],
      b = n[i % n.length];
    d += ` C ${a.out.x} ${a.out.y} ${b.in.x} ${b.in.y} ${b.x} ${b.y}`;
  }
  if (s.closed) d += " Z";
  for (const h of s.holes ?? []) if (h.length) d += ring(h);
  return d;
}
