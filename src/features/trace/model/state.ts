import { reactive } from "vue";
import type { Shape } from "../../../shared/types";
import type { TraceParams } from "../lib/types";

export const trace = reactive({
  open: false,
  status: "idle" as "idle" | "busy" | "ready" | "error",
  stage: "",
  progress: 0,
  error: "",
  fileName: "",
  imageUrl: "",
  image: null as ImageData | null,
  /** true when the source was downscaled to the tracing cap */
  scaled: false,
  palette: [] as string[],
  background: -1,
  params: {
    colors: 3,
    denoise: 1,
    precision: 1,
    minArea: 8,
    corner: 60,
    ignored: [],
    ignoreAuto: true,
  } as TraceParams,
  /** preview shapes; pushed into the document on confirm */
  shapes: [] as Shape[],
  stats: "",
});
