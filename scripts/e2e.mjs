/**
 * End-to-end test: trace a synthetic two-color logo in the built app.
 * Requires: npm run build && npx playwright install chromium
 * Run with: node scripts/e2e.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// chromium system libraries extracted locally (no root on this machine)
const localLibs = "/tmp/chromium-libs";
if (existsSync(localLibs)) {
  const dirs = [
    `${localLibs}/usr/lib/aarch64-linux-gnu`,
    `${localLibs}/lib/aarch64-linux-gnu`,
  ];
  process.env.LD_LIBRARY_PATH =
    dirs.join(":") + (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
}

const dist = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");

/* ---- minimal PNG encoder ---- */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(
      raw,
      row + 1,
    );
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- synthetic two-color logo: black ring with a hole + red square ---- */
const W = 80,
  H = 80;
const px = new Uint8ClampedArray(W * H * 4);
const paint = (x0, y0, x1, y1, [r, g, b, a]) => {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
};
paint(0, 0, W, H, [255, 255, 255, 255]);
paint(10, 10, 50, 50, [20, 20, 20, 255]); // black ring
paint(22, 22, 38, 38, [255, 255, 255, 255]); // punched hole
paint(58, 58, 72, 72, [220, 40, 40, 255]); // red square
const logoPng = png(W, H, px);

/* ---- static server for dist/ ---- */
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  const path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const data = await readFile(join(dist, path));
    res.setHeader("content-type", mime[extname(path)] ?? "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  ok -", msg);
  else {
    failures++;
    console.error("  FAIL -", msg);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => {
  failures++;
  console.error("  FAIL - page error:", e.message);
});
await page.goto(`http://127.0.0.1:${port}/`);

const layersBefore = await page.locator("button.layer").count();

// open the trace panel and feed it the logo
await page.click('[data-testid="tool-trace"]');
await page.setInputFiles('.trace-panel input[type="file"]', {
  name: "logo.png",
  mimeType: "image/png",
  buffer: logoPng,
});
await page.waitForFunction(
  () =>
    [...document.querySelectorAll(".trace-panel h3 span")].some(
      (e) => e.textContent === "ready",
    ),
  { timeout: 20000 },
);
ok(true, "trace completed (worker finished)");

const stats = await page.locator(".trace-panel .note").first().textContent();
console.log("  stats:", stats);

// preview renders real curve paths on the artboard before confirming
const previewPaths = await page.locator("svg g[opacity='0.92'] path").count();
ok(previewPaths === 2, `preview shows 2 traced shapes (got ${previewPaths})`);
await page
  .locator("main")
  .screenshot({ path: "/tmp/trace-preview.png" });

// confirm -> shapes become document layers
await page.click('[data-testid="trace-confirm"]');
const layersAfter = await page.locator("button.layer").count();
ok(
  layersAfter - layersBefore === 2,
  `2 new layers after confirm (got ${layersAfter - layersBefore})`,
);
const names = await page.locator("button.layer").allTextContents();
console.log("  layers:", names.map((n) => n.trim()).join(" | "));
const traceNames = names.filter((n) => n.includes("Trace #"));
ok(traceNames.length === 2, `layers named per traced color (got ${traceNames.length})`);
const blackName = traceNames.find((n) => !n.includes("#dc") && !n.includes("#DB"));
ok(!!blackName, "black layer present");

// select the traced ring (black group) and inspect its nodes
await page.locator("button.layer", { hasText: blackName.trim() }).first().click();
await page.click('[data-testid="tool-nodes"]');
const anchors = await page.locator("rect[data-testid='anchor']").count();
ok(anchors >= 8, `node tool edits the traced curves (${anchors} anchors incl. hole)`);
await page.locator("main").screenshot({ path: "/tmp/trace-nodes.png" });

// fill change applies to the traced group
await page.click('[data-testid="tool-select"]');
await page.locator(".swatches button").first().click();
const fill = await page
  .locator("svg path")
  .evaluateAll(
    (els) =>
      els
        .map((e) => e.getAttribute("fill"))
        .filter((f) => f === "#7754d6").length,
  );
ok(fill >= 1, "fill change applies to traced paths");

// export produces real curve paths with even-odd holes
const [download] = await Promise.all([
  page.waitForEvent("download"),
  page.click('[data-testid="export"]'),
]);
const svg = await readFile(await download.path(), "utf8");
ok(svg.includes('fill-rule="evenodd"'), "exported SVG keeps holes (evenodd)");
ok(
  (svg.match(/<path /g) || []).length >= layersAfter,
  "exported SVG contains one path per shape",
);
ok(/C [\d.]+ [\d.]+/.test(svg), "exported paths are cubic curves");

await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILURES` : "\ne2e passed");
process.exit(failures ? 1 : 0);
