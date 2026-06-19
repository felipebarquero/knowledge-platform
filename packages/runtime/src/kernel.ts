import { bindDataFrame, captureR, getWebR, installPackages } from "./webr";
import type { RRunResult } from "./webr";

/**
 * The execution kernel — a single shared session, like a notebook kernel.
 *
 * Two jobs:
 *  1. **A shared table registry.** SQL cells publish their result rows under a
 *     name (`provideTable`). The kernel materialises every registered table as
 *     a real R data frame in the session, so an R cell can use a SQL result
 *     directly (e.g. `colMeans(sprint_query["mean_time"])`).
 *  2. **A persistent R session.** R runs in WebR's global environment, so a
 *     variable assigned in one cell (`model <- lmer(...)`) is available in the
 *     next. R runs are serialised through a queue, giving deterministic
 *     top-to-bottom notebook semantics (and avoiding concurrent WebR access).
 *
 * Tables carry a version so they're only re-synced into R when they change
 * (e.g. a SQL cell's recorded snapshot is replaced by live results).
 */

type Rows = Record<string, unknown>[];

interface Table {
  rows: Rows;
  version: number;
  syncedVersion: number;
}

export interface KernelRunOptions {
  /** Packages to install before running (from the WebR repo). */
  packages?: string[];
  /** Datasets to publish + inject for this run: name → rows. */
  datasets?: Record<string, Rows>;
  /** Wait for these tables to be provided before running (cell dependencies). */
  uses?: string[];
  capturePlot?: boolean;
}

const VALID_NAME = /^[A-Za-z.][A-Za-z0-9._]*$/;

class Kernel {
  private tables = new Map<string, Table>();
  private waiters = new Map<string, (() => void)[]>();
  private queue: Promise<unknown> = Promise.resolve();
  /** True once the persistent R session has been touched in this scope. */
  rStarted = false;

  /** Publish (or update) a named table; resolves anything waiting on it. */
  provideTable(name: string, rows: Rows): void {
    if (!VALID_NAME.test(name)) return;
    const existing = this.tables.get(name);
    this.tables.set(name, {
      rows,
      version: (existing?.version ?? 0) + 1,
      syncedVersion: existing?.syncedVersion ?? -1,
    });
    this.waiters.get(name)?.forEach((resolve) => resolve());
    this.waiters.delete(name);
  }

  hasTable(name: string): boolean {
    return this.tables.has(name);
  }

  /** Names currently available as R data frames / pending injection. */
  tableNames(): string[] {
    return [...this.tables.keys()];
  }

  private waitFor(name: string, timeoutMs = 8000): Promise<void> {
    if (this.tables.has(name)) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs); // don't block forever
      const list = this.waiters.get(name) ?? [];
      list.push(() => {
        clearTimeout(timer);
        resolve();
      });
      this.waiters.set(name, list);
    });
  }

  /** Run R in the persistent session; serialised so cells execute in order. */
  runR(code: string, options: KernelRunOptions = {}): Promise<RRunResult> {
    const task = this.queue.then(() => this.execute(code, options));
    // Keep the chain alive even if a run rejects.
    this.queue = task.catch(() => undefined);
    return task;
  }

  private async execute(code: string, options: KernelRunOptions): Promise<RRunResult> {
    const { packages = [], datasets = {}, uses = [], capturePlot = true } = options;
    const started = performance.now();
    this.rStarted = true;
    try {
      for (const name of uses) await this.waitFor(name);
      const webR = await getWebR();
      if (packages.length) await installPackages(webR, packages);

      // Register this run's datasets, then sync every changed table into R.
      for (const [name, rows] of Object.entries(datasets)) this.provideTable(name, rows);
      for (const [name, table] of this.tables) {
        if (table.syncedVersion !== table.version) {
          await bindDataFrame(webR, name, table.rows);
          table.syncedVersion = table.version;
        }
      }

      const capture = await captureR(webR, code, capturePlot);
      return { ...capture, elapsedMs: performance.now() - started };
    } catch (error) {
      return {
        text: "",
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: performance.now() - started,
      };
    }
  }

  /** Reset session state (studio re-runs). Tables are dropped; R env is cleared. */
  async reset(): Promise<void> {
    this.tables.clear();
    this.waiters.clear();
    this.queue = Promise.resolve();
    try {
      const webR = await getWebR();
      await webR.evalRVoid("rm(list = ls())");
    } catch {
      // session not started yet — nothing to clear
    }
  }
}

/**
 * One kernel per **scope** (a document / chapter / article id). SQL↔R dataframe
 * sharing is bounded to a scope, so two documents never collide in the same R
 * session. NOTE: WebR itself is a single WASM instance per page, but the R
 * global env is cleared between scopes via {@link Kernel.reset} when needed;
 * within a scope the persistent-session semantics hold.
 */
const kernels = new Map<string, Kernel>();

/** Get (or lazily create) the kernel for a scope. Default scope = "default". */
export function getKernel(scope = "default"): Kernel {
  let k = kernels.get(scope);
  if (!k) {
    k = new Kernel();
    kernels.set(scope, k);
  }
  return k;
}

/** The default-scope kernel (back-compat for callers that don't scope). */
export const kernel = getKernel("default");

export interface KernelScopeInfo {
  /** Scope id (the document / chapter / article the kernel is bound to). */
  scope: string;
  /** Shared tables (SQL results materialised as R data frames) in this scope. */
  tables: string[];
  /** Whether the persistent R (WebR) session has been started in this scope. */
  rStarted: boolean;
}

/** Snapshot of every live kernel scope — drives the reader's Kernels panel. */
export function kernelScopes(): KernelScopeInfo[] {
  return [...kernels.entries()].map(([scope, k]) => ({
    scope,
    tables: k.tableNames(),
    rStarted: k.rStarted,
  }));
}
