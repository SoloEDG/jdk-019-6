import { runPipeline } from "./lib/pipeline";
import type { TraceJob, WorkerOut } from "./lib/types";

const post = (msg: WorkerOut) =>
  (self as unknown as { postMessage(m: WorkerOut): void }).postMessage(msg);

self.onmessage = (e: MessageEvent) => {
  const job = e.data as TraceJob;
  try {
    const result = runPipeline(job, (stage, pct) =>
      post({ type: "progress", stage, pct }),
    );
    post({ type: "done", result });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
