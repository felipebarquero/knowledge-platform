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
