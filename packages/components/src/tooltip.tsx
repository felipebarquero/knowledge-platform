import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Lightweight glass tooltip for plots. The tooltip is rendered in a portal to
 * document.body with fixed (viewport) positioning, so it is NEVER clipped by
 * the component's size or overflow — it can spill outside the chart/card.
 */
export interface TipState {
  /** Viewport coordinates of the cursor. */
  x: number;
  y: number;
  lines: string[];
}

export function useTip() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const show = (event: { clientX: number; clientY: number }, lines: string[]) => {
    setTip({ x: event.clientX, y: event.clientY, lines });
  };

  const hide = () => setTip(null);

  return { ref, tip, show, hide };
}

export function ChartTip({ tip }: { tip: TipState | null }) {
  if (tip === null || typeof document === "undefined") return null;
  // Flip to the left/up near the viewport edges so it stays on screen.
  const flipX = tip.x > window.innerWidth - 260;
  const flipY = tip.y > window.innerHeight - 120;
  return createPortal(
    <div
      className="kp-tip"
      style={{
        left: flipX ? undefined : tip.x + 14,
        right: flipX ? window.innerWidth - tip.x + 14 : undefined,
        top: flipY ? undefined : tip.y + 14,
        bottom: flipY ? window.innerHeight - tip.y + 14 : undefined,
      }}
      role="status"
    >
      {tip.lines.map((line, i) => (
        <div key={i} className={i === 0 ? "kp-tip__head" : "kp-tip__line"}>
          {line}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function TipBox({
  boxRef,
  tip,
  children,
}: {
  boxRef: React.RefObject<HTMLDivElement | null>;
  tip: TipState | null;
  children: ReactNode;
}) {
  return (
    <div className="kp-plot-box" ref={boxRef}>
      {children}
      <ChartTip tip={tip} />
    </div>
  );
}

/** Tooltip-friendly value formatting (dates → ISO day, numbers → 2dp). */
export function fmtVal(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}
