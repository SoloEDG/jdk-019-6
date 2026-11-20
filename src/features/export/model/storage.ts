import { beginEdit, revision } from "../../drawing";
import { ref } from "vue";
import { doc } from "../../../shared/document";
import type { Shape, Point } from "../../../shared/types";
export const storageStatus = ref("All changes saved locally");
export function save() {
  try {
    localStorage.setItem("forma-document", JSON.stringify(doc.shapes));
    storageStatus.value = "All changes saved locally";
  } catch {
    storageStatus.value =
      "Local storage unavailable — export to keep your work";
  }
}
function point(v: Point) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y);
}
function node(v: unknown): v is Shape["nodes"][number] {
  const n = v as Shape["nodes"][number];
  return point(n) && point(n.in) && point(n.out);
}
function valid(s: Shape) {
  return (
    s &&
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    Array.isArray(s.nodes) &&
    s.nodes.every(node) &&
    (!s.holes ||
      (Array.isArray(s.holes) &&
        s.holes.every((h) => Array.isArray(h) && h.every(node)))) &&
    typeof s.fill === "string" &&
    /^(none|#[0-9a-f]{3,8})$/i.test(s.fill) &&
    typeof s.stroke === "string" &&
    /^#[0-9a-f]{3,8}$/i.test(s.stroke) &&
    Number.isFinite(s.width) &&
    Number.isFinite(s.opacity)
  );
}
export function restore() {
  try {
    const value = JSON.parse(localStorage.getItem("forma-document") || "null");
    if (Array.isArray(value) && value.every(valid)) {
      beginEdit();
      doc.shapes = value;
      revision.value++;
      doc.selected = [];
      return true;
    }
  } catch {}
  return false;
}
