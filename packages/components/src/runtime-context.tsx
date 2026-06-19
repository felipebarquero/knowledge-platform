import { createContext, useContext } from "react";

/**
 * Phase 5 runtime context — dataset name → raw CSV text, for the DuckDB SQL
 * engine. Provided once at the document root so SQL components anywhere in the
 * tree (including inside cards) reach it without prop-drilling.
 */
export const CsvContext = createContext<Record<string, string>>({});

export function useCsvMap(): Record<string, string> {
  return useContext(CsvContext);
}

/** A cell's current source + latest outputs, captured for notebook export. */
export interface NotebookCellData {
  source: string;
  language: string;
  kind: "code" | "sql";
  outputs?: {
    text?: string;
    table?: Record<string, unknown>[];
    plot?: string;
    info?: Record<string, unknown>;
    error?: string;
  };
}

/**
 * The live-cell session, provided once at the document root (reader or studio
 * canvas). Carries the kernel scope and the wiring that makes code/SQL cells
 * editable + exportable without prop-drilling through ComponentRenderer.
 *
 *  - `scope`         → which kernel session (a document / chapter / article id).
 *  - `editable`      → are cells inline-editable in this projection?
 *  - `onSourceChange`→ persistence hook (studio writes the draft); absent in the
 *                      reader, so reader edits are ephemeral (lost on reload).
 *  - `register`      → a cell publishes its current source + outputs here so the
 *                      notebook export can capture edits + live results.
 */
export interface CellSession {
  scope: string;
  editable: boolean;
  onSourceChange?: (cellId: string, source: string) => void;
  register?: (cellId: string, data: NotebookCellData) => void;
}

const DEFAULT_SESSION: CellSession = { scope: "default", editable: false };

export const CellSessionContext = createContext<CellSession>(DEFAULT_SESSION);

export function useCellSession(): CellSession {
  return useContext(CellSessionContext);
}
