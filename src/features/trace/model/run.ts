import { trace } from "./state";
import type { Node, Shape } from "../../../shared/types";
import type { RawNode, TraceResult, WorkerOut } from "../lib/types";

let worker: Worker | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** images larger than this are downscaled before tracing */
const MAX_DIM = 2400;

const toNode = (r: RawNode): Node => ({
  x: r.x,
  y: r.y,
  in: { x: r.ix, y: r.iy },
  out: { x: r.ox, y: r.oy },
});

function finish(result: TraceResult) {
  trace.palette = result.palette;
  trace.background = result.background;
  const groups = new Map<number, string>();
  const counts = new Map<number, number>();
  trace.shapes = result.shapes.map((rs) => {
    let group = groups.get(rs.color);
    if (!group) {
      group = crypto.randomUUID();
      groups.set(rs.color, group);
    }
    const k = (counts.get(rs.color) ?? 0) + 1;
    counts.set(rs.color, k);
    return {
      id: crypto.randomUUID(),
      name: `Trace ${rs.fill} · ${k}`,
      nodes: rs.ring.map(toNode),
      ...(rs.holes.length ? { holes: rs.holes.map((h) => h.map(toNode)) } : {}),
      closed: true,
      fill: rs.fill,
      stroke: rs.fill,
      width: 0,
      opacity: 1,
      group,
    } satisfies Shape;
  });
  trace.stats = trace.shapes.length
    ? `${trace.shapes.length} shapes · ${result.nodes} nodes · ${result.ms} ms`
    : "Nothing to trace — every color is set as background";
  trace.status = "ready";
  trace.progress = 1;
}

export function cancelWork() {
  worker?.terminate();
  worker = null;
}

/** cancel the running job; the document stays editable and the last preview stays */
export function cancel() {
  cancelWork();
  clearTimeout(timer);
  if (trace.status === "busy")
    trace.status = trace.shapes.length ? "ready" : "idle";
}

export function run() {
  cancelWork();
  clearTimeout(timer);
  const image = trace.image;
  if (!image) return;
  trace.status = "busy";
  trace.stage = "start";
  trace.progress = 0;
  trace.error = "";
  worker = new Worker(new URL("../worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (msg.type === "progress") {
      trace.stage = msg.stage;
      trace.progress = msg.pct;
    } else if (msg.type === "done") {
      worker = null;
      finish(msg.result);
    } else {
      worker = null;
      trace.status = "error";
      trace.error = msg.message;
    }
  };
  worker.onerror = (e) => {
    worker = null;
    trace.status = "error";
    trace.error = e.message || "Tracing failed";
  };
  const p = trace.params;
  worker.postMessage({
    width: image.width,
    height: image.height,
    data: image.data,
    params: {
      colors: p.colors,
      denoise: p.denoise,
      precision: p.precision,
      minArea: p.minArea,
      corner: p.corner,
      ignored: [...p.ignored],
      ignoreAuto: p.ignoreAuto,
    },
  });
}

/** debounced re-trace used by parameter changes */
export function scheduleRun() {
  clearTimeout(timer);
  timer = setTimeout(run, 300);
}

export async function loadFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not decode the image"));
      i.src = url;
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    cancel();
    if (trace.imageUrl) URL.revokeObjectURL(trace.imageUrl);
    trace.imageUrl = url;
    trace.image = ctx.getImageData(0, 0, w, h);
    trace.scaled = scale < 1;
    trace.fileName = file.name;
    trace.palette = [];
    trace.background = -1;
    trace.shapes = [];
    trace.params.ignored = [];
    trace.params.ignoreAuto = true;
    scheduleRun();
  } catch (err) {
    URL.revokeObjectURL(url);
    trace.status = "error";
    trace.error = err instanceof Error ? err.message : "Could not read image";
  }
}

/** close the panel: stop work and clear the preview, keep image and settings */
export function close() {
  cancel();
  trace.shapes = [];
  trace.open = false;
}
