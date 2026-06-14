import type { WebR } from "webr";

/**
 * Low-level WebR helpers (R compiled to WASM). The R session is a persistent
 * singleton — assignments live in the global environment and survive across
 * runs, which is what the kernel (kernel.ts) builds on. These helpers handle
 * session init, package install, data-frame binding (type-preserving, with
 * temp-var cleanup) and result capture.
 */

export interface RTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface RCapture {
  text: string;
  table?: RTable;
  plot?: string;
}

export interface RRunResult extends RCapture {
  info?: Record<string, unknown>;
  error?: string;
  elapsedMs: number;
}

let webrPromise: Promise<WebR> | null = null;
const installed = new Set<string>();

export function getWebR(): Promise<WebR> {
  if (webrPromise) return webrPromise;
  webrPromise = (async () => {
    const { WebR } = await import("webr");
    const webR = new WebR({ interactive: false });
    await webR.init();
    return webR;
  })();
  return webrPromise;
}

export async function installPackages(webR: WebR, packages: string[]): Promise<void> {
  const toInstall = packages.filter((p) => !installed.has(p));
  if (toInstall.length === 0) return;
  await webR.installPackages(toInstall);
  toInstall.forEach((p) => installed.add(p));
}

function inferColumn(values: unknown[]): number[] | string[] {
  if (values.every((v) => typeof v === "number" || v === null || v === undefined)) {
    return values.map((v) => (typeof v === "number" ? v : NaN));
  }
  return values.map((v) => (v == null ? "" : String(v)));
}

/**
 * Bind `rows` as an R data frame named `name` in the global environment.
 * Columns are bound individually to preserve types, then the temporaries are
 * removed so the shared session stays clean.
 */
export async function bindDataFrame(
  webR: WebR,
  name: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) {
    await webR.evalRVoid(`${name} <- data.frame()`);
    return;
  }
  const cols = Object.keys(rows[0]!);
  const temps: string[] = [];
  const assignments: string[] = [];
  cols.forEach((col, i) => {
    const temp = `.kp_col_${i}`;
    temps.push(temp);
    assignments.push(`\`${col}\` = ${temp}`);
  });
  for (let i = 0; i < cols.length; i++) {
    await webR.objs.globalEnv.bind(temps[i]!, inferColumn(rows.map((r) => r[cols[i]!])));
  }
  await webR.evalRVoid(
    `${name} <- data.frame(${assignments.join(", ")}, stringsAsFactors = FALSE, check.names = FALSE); rm(${temps.join(", ")})`,
  );
}

/**
 * Run `code` in the global environment and capture stdout, a returned
 * data.frame (→ table) and any plot. Uses captureR's `result` object (not
 * `.Last.value`, which the data-frame probe would otherwise clobber).
 */
export async function captureR(webR: WebR, code: string, capturePlot = true): Promise<RCapture> {
  const shelter = await new webR.Shelter();
  try {
    const capture = await shelter.captureR(code, {
      withAutoprint: true,
      captureGraphics: capturePlot ? { width: 480, height: 300 } : false,
    });

    const text = capture.output
      .filter((o) => o.type === "stdout" || o.type === "stderr")
      .map((o) => o.data as string)
      .join("\n");

    let table: RTable | undefined;
    try {
      await webR.objs.globalEnv.bind(".kp_last", capture.result);
      const isDf = (await (await shelter.evalR("is.data.frame(.kp_last)")).toJs()) as {
        values: boolean[];
      };
      if (isDf.values?.[0]) {
        const df = (await (await shelter.evalR("as.data.frame(.kp_last)")).toJs()) as {
          names?: string[];
          values: { values: unknown[] }[];
        };
        if (df.names && df.values) {
          const columns = df.names;
          const n = df.values[0]?.values.length ?? 0;
          const rows: Record<string, unknown>[] = [];
          for (let i = 0; i < n; i++) {
            const row: Record<string, unknown> = {};
            columns.forEach((c, ci) => (row[c] = df.values[ci]?.values[i]));
            rows.push(row);
          }
          table = { columns, rows };
        }
      }
      await webR.evalRVoid("rm(.kp_last)");
    } catch {
      // not a data frame / conversion failed — text output stands alone
    }

    const plot =
      capture.images.length > 0
        ? imageBitmapToDataUrl(capture.images[capture.images.length - 1]!)
        : undefined;

    return { text, table, plot };
  } finally {
    await shelter.purge();
  }
}

export function imageBitmapToDataUrl(bitmap: ImageBitmap): string | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return canvas.toDataURL("image/png");
}
