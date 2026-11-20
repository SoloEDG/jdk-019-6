import { beginEdit } from "../../drawing/model/history";
import { doc } from "../../../shared/document";
import { trace } from "./state";
import { cancelWork } from "./run";

/**
 * Move the previewed trace into the document as one undoable step.
 * Shapes are grouped per color and stacked largest-first, so the Layers
 * panel reflects both color and spatial containment.
 */
export function confirmTrace() {
  if (!trace.shapes.length) return;
  beginEdit();
  doc.shapes.push(...trace.shapes);
  doc.selected = trace.shapes.map((s) => s.id);
  trace.shapes = [];
  trace.open = false;
  cancelWork();
}
