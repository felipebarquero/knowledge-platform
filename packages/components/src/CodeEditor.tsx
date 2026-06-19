import { useRef } from "react";
import { highlightLine } from "./CodeBlock";

/**
 * Live syntax-highlighted code editor — the "editor in ~40 lines" technique:
 * a transparent <textarea> layered over a highlighted <pre>, sharing identical
 * font metrics so the caret + selection align with the colored text behind.
 * Reuses the zero-dep `highlightLine` tokenizer. The cell grows to fit its
 * content (no inner vertical scrollbar); long lines scroll horizontally with
 * the pre kept in sync.
 */
export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  lineNumbers?: boolean;
  fontSize?: number;
  wrap?: boolean;
  readOnly?: boolean;
  /** ⌘/Ctrl+Enter handler (run the cell). */
  onRun?: () => void;
  minRows?: number;
}

export function CodeEditor({
  value,
  onChange,
  language = "text",
  lineNumbers = true,
  fontSize = 13,
  wrap = false,
  readOnly = false,
  onRun,
  minRows = 1,
}: CodeEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  // Split on newlines; a trailing "" line keeps the colored layer in step with
  // the textarea while the caret sits on a fresh blank line.
  const displayLines = value.split("\n");

  return (
    <div className={`kp-codeeditor ${wrap ? "kp-codeeditor--wrap" : ""}`} style={{ fontSize }}>
      {lineNumbers && (
        <div className="kp-codeeditor__gutter" aria-hidden="true">
          {displayLines.map((_, i) => (
            <span key={i} className="kp-code__num">
              {i + 1}
            </span>
          ))}
        </div>
      )}
      <div className="kp-codeeditor__scroll">
        <pre className="kp-codeeditor__pre" ref={preRef} aria-hidden="true">
          <code>
            {displayLines.map((line, i) => (
              <span key={i} className="kp-code__line">
                <span className="kp-code__content">{highlightLine(line, language)}</span>
              </span>
            ))}
          </code>
        </pre>
        <textarea
          ref={taRef}
          className="kp-codeeditor__input"
          value={value}
          spellCheck={false}
          readOnly={readOnly}
          wrap={wrap ? "soft" : "off"}
          rows={Math.max(minRows, displayLines.length)}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            // Long lines: keep the colored layer scrolled with the textarea.
            if (preRef.current) preRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }}
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              // Insert two spaces instead of moving focus.
              e.preventDefault();
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              onChange(value.slice(0, start) + "  " + value.slice(end));
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + 2;
              });
            } else if (onRun && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              onRun();
            }
          }}
        />
      </div>
    </div>
  );
}
