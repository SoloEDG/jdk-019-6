export interface Pt {
  x: number;
  y: number;
}

export interface TraceParams {
  /** palette size (color merging), 2..8 */
  colors: number;
  /** denoise blur radius in px, 0 = off */
  denoise: number;
  /** curve error budget in image px — smaller = more faithful, more nodes */
  precision: number;
  /** specks and holes smaller than this area (px^2) are dropped */
  minArea: number;
  /** turn angle (degrees) at or above which a vertex is kept as a sharp corner */
  corner: number;
  /** palette indices the user excluded (treated as background) */
  ignored: number[];
  /** also treat the auto-detected corner color as background */
  ignoreAuto: boolean;
}

export interface TraceJob {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  params: TraceParams;
}

/** flat node so the worker can post it cheaply */
export interface RawNode {
  x: number;
  y: number;
  ix: number;
  iy: number;
  ox: number;
  oy: number;
}

export interface RawShape {
  /** palette index */
  color: number;
  fill: string;
  /** outer ring area in px^2, used for stacking order */
  area: number;
  ring: RawNode[];
  holes: RawNode[][];
}

export interface TraceResult {
  palette: string[];
  /** auto-detected background palette index, -1 = transparent/none */
  background: number;
  shapes: RawShape[];
  nodes: number;
  ms: number;
}

export type WorkerOut =
  | { type: "progress"; stage: string; pct: number }
  | { type: "done"; result: TraceResult }
  | { type: "error"; message: string };
