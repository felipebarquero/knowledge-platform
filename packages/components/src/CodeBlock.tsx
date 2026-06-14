import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CellOutput, cellTabs } from "./CellOutput";
import type { CellOutputData } from "./CellOutput";

/**
 * Syntax-highlighted code block (zero dependencies). The tokenizer is a
 * deliberately small regex pass (comments, strings, numbers, keywords) —
 * swapping it for shiki/prism later is a renderer-only change; the IR
 * stores only { language, value }.
 */

// Control-flow / declaration keywords only. Builtin functions (print, lmer,
// AVG…) fall through to function detection; literals (True, NULL…) are
// classified as constants — see CONSTANTS below.
const KEYWORDS: Record<string, string[]> = {
  python: ["def", "return", "import", "from", "for", "in", "if", "elif", "else", "class", "lambda", "with", "as", "and", "or", "not", "is", "while", "try", "except", "finally", "raise", "yield", "pass", "break", "continue", "global", "nonlocal", "assert"],
  r: ["function", "return", "for", "in", "if", "else", "while", "repeat", "break", "next"],
  javascript: ["const", "let", "var", "function", "return", "import", "export", "from", "for", "of", "in", "if", "else", "class", "new", "await", "async", "typeof", "instanceof", "delete", "void", "yield", "switch", "case", "default", "break", "continue", "throw", "try", "catch", "finally"],
  typescript: ["const", "let", "var", "function", "return", "import", "export", "from", "for", "of", "in", "if", "else", "class", "new", "await", "async", "typeof", "instanceof", "switch", "case", "default", "break", "continue", "throw", "try", "catch", "finally", "interface", "type", "extends", "implements", "readonly", "keyof", "as", "satisfies", "enum", "namespace"],
  sql: ["SELECT", "FROM", "WHERE", "GROUP", "BY", "ORDER", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "ON", "AS", "AND", "OR", "NOT", "IN", "IS", "BETWEEN", "LIKE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "LIMIT", "OFFSET", "HAVING", "DISTINCT", "ASC", "DESC", "UNION", "ALL", "WITH"],
  bash: ["if", "then", "else", "elif", "fi", "for", "do", "done", "while", "case", "esac", "function", "return", "export", "local", "in"],
  yaml: [],
  text: [],
};

/** Language constants/builtins rendered in the constant color (Darcula purple). */
const CONSTANTS: Record<string, string[]> = {
  python: ["None", "True", "False", "self", "cls", "__name__"],
  r: ["TRUE", "FALSE", "NULL", "NA", "Inf", "NaN", "T", "F"],
  javascript: ["true", "false", "null", "undefined", "this", "NaN", "Infinity"],
  typescript: ["true", "false", "null", "undefined", "this", "NaN", "Infinity"],
  sql: ["NULL", "TRUE", "FALSE"],
  bash: [],
  yaml: ["true", "false", "null"],
  text: [],
};

const COMMENT_PREFIX: Record<string, string> = {
  python: "#",
  r: "#",
  yaml: "#",
  bash: "#",
  javascript: "//",
  typescript: "//",
  sql: "--",
};

/** SQL keywords are matched case-insensitively. */
const SQL_KEYWORDS = new Set((KEYWORDS.sql ?? []).map((kw) => kw.toUpperCase()));

/**
 * JetBrains/Darcula-style tokenizer. Classifies a line into keyword,
 * constant, function call (ident before "("), string, number and comment
 * tokens; everything else is default foreground. Deliberately small — a
 * regex pass, not a parser — and swappable for shiki/tree-sitter later.
 */
export function highlightLine(line: string, language: string): ReactNode[] {
  const keywords = new Set(KEYWORDS[language] ?? []);
  const constants = new Set(CONSTANTS[language] ?? []);
  const isSql = language === "sql";
  const comment = COMMENT_PREFIX[language];
  const parts: ReactNode[] = [];

  // Order matters: comment & string consume first, then numbers, idents, the rest.
  const pattern = new RegExp(
    [
      comment ? `(?<comment>${comment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*$)` : null,
      "(?<string>\"[^\"]*\"|'[^']*'|`[^`]*`)",
      "(?<number>\\b\\d+(?:\\.\\d+)?\\b)",
      "(?<ident>[A-Za-z_]\\w*)",
    ]
      .filter(Boolean)
      .join("|"),
    "g",
  );

  let last = 0;
  let key = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(line.slice(last, index));
    const groups = match.groups ?? {};
    const word = match[0];
    let kind: string | null = null;

    if (groups.comment !== undefined) kind = "comment";
    else if (groups.string !== undefined) kind = "string";
    else if (groups.number !== undefined) kind = "number";
    else if (groups.ident !== undefined) {
      const followedByParen = /^\s*\(/.test(line.slice(index + word.length));
      if (isSql ? SQL_KEYWORDS.has(word.toUpperCase()) : keywords.has(word)) kind = "keyword";
      else if (constants.has(word)) kind = "constant";
      else if (followedByParen) kind = "function";
      else kind = null; // default foreground
    }

    if (kind) {
      parts.push(
        <span key={key++} className={`kp-code__${kind}`}>
          {word}
        </span>,
      );
    } else {
      parts.push(word);
    }
    last = index + word.length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length ? parts : [" "];
}

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  lineNumbers?: boolean;
  wrap?: boolean;
  fontSize?: number;
  /** Recorded execution time of the authored run (e.g. "0.6s") — static metadata. */
  elapsed?: string;
  /** Recorded REPL output, shown in a tabbed pane below the code (no line numbers). */
  output?: CellOutputData;
  /** Phase 5: when "r", the cell runs live in WebR. */
  runtime?: "r";
  /** Dataset injected as an R data frame: name → rows. */
  inject?: { name: string; rows: Record<string, unknown>[] };
  /** Kernel tables this cell depends on — waits for them before running. */
  uses?: string[];
  /** Auto-run live on mount (default true when runtime is set). */
  autoRun?: boolean;
}

type RunStatus = "idle" | "running" | "ok" | "error";

export function CodeBlock({
  code,
  language = "text",
  title,
  lineNumbers = true,
  wrap = false,
  fontSize = 13,
  elapsed,
  output,
  runtime,
  inject,
  uses,
  autoRun = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [liveOutput, setLiveOutput] = useState<CellOutputData | null>(null);
  const [liveMs, setLiveMs] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const lines = code.replace(/\n$/, "").split("\n");
  const shown = liveOutput ?? output;
  const tabs = shown ? cellTabs(shown) : [];

  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  const execute = async () => {
    if (runtime !== "r") return;
    setStatus("running");
    setRunError(null);
    setProgress("starting R…");
    try {
      // Auto-detect packages to install from library(...) calls.
      const packages = [...code.matchAll(/library\(([A-Za-z0-9._]+)\)/g)].map((m) => m[1]!);
      if (packages.length) setProgress(`installing ${packages.join(", ")}…`);
      else setProgress("running in R…");
      const { kernel } = await import("@knowledge/runtime");
      // Runs in the shared session: SQL results are data frames here, and
      // variables from earlier R cells persist.
      const result = await kernel.runR(code, {
        packages,
        datasets: inject ? { [inject.name]: inject.rows } : {},
        uses,
      });
      if (result.error) {
        setRunError(result.error);
        setStatus("error");
        return;
      }
      setLiveOutput({ text: result.text, table: result.table?.rows, plot: result.plot, info: result.info });
      setLiveMs(result.elapsedMs);
      setStatus("ok");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    if (runtime === "r" && autoRun) void execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, autoRun]);

  return (
    <figure className="kp-codeblock" style={{ fontSize }}>
      <header className="kp-codeblock__bar">
        <span className="kp-codeblock__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {title ? <span className="kp-codeblock__title">{title}</span> : <span />}
        <span className="kp-codeblock__meta">
          {status === "running" && (
            <span className="kp-codeblock__running">
              <span className="hui-spinner hui-spinner--inline" aria-hidden="true" /> {progress}
            </span>
          )}
          {status === "ok" && liveMs !== null && (
            <span className="kp-codeblock__elapsed">✓ {(liveMs / 1000).toFixed(1)}s · live</span>
          )}
          {status === "error" && <span className="kp-sql__error">✗ R error</span>}
          {status === "idle" && elapsed && <span className="kp-codeblock__elapsed">✓ {elapsed}</span>}
          {language !== "text" && <span className="kp-codeblock__lang">{language}</span>}
          {runtime === "r" && (
            <button
              type="button"
              className="kp-codeblock__copy"
              onClick={() => void execute()}
              disabled={status === "running"}
            >
              ▶ Run
            </button>
          )}
          <button type="button" className="kp-codeblock__copy" onClick={copy}>
            {copied ? "copied ✓" : "copy"}
          </button>
        </span>
      </header>
      <pre className={`kp-codeblock__pre ${wrap ? "kp-codeblock__pre--wrap" : ""}`}>
        <code>
          {/* Only the code carries line numbers; the output pane never does. */}
          {lines.map((line, i) => (
            <span key={i} className="kp-code__line">
              {lineNumbers && <span className="kp-code__num">{i + 1}</span>}
              <span className="kp-code__content">{highlightLine(line, language)}</span>
            </span>
          ))}
        </code>
      </pre>
      {runError && <div className="kp-cell-error">✗ {runError}{output ? " — showing recorded output" : ""}</div>}
      {tabs.length > 0 && shown && <CellOutput data={shown} />}
    </figure>
  );
}
