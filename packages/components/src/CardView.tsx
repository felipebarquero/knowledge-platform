import type { ReactNode } from "react";

/**
 * HeroUI-inspired card, rendered in macOS Tahoe liquid-glass style.
 * Parameter vocabulary mirrors HeroUI's Card API (shadow, radius,
 * isHoverable, fullWidth) plus glass-specific blur.
 */
export interface CardViewProps {
  title?: string;
  body?: string;
  /** Monospace code/formula line (HeroUI CardHeader-style content). */
  code?: string;
  /** Extra header content (e.g. the active sync-filter chip). */
  headerExtra?: ReactNode;
  variant: "glass" | "flat" | "bordered";
  radius: "sm" | "md" | "lg" | "xl";
  shadow: "none" | "sm" | "md" | "lg";
  blur: number;
  padding: number;
  isHoverable: boolean;
  fullWidth: boolean;
  children?: ReactNode;
}

const RADII = { sm: 10, md: 14, lg: 20, xl: 28 } as const;

const SHADOWS = {
  none: "none",
  sm: "0 2px 8px rgba(0,0,0,0.25)",
  md: "0 8px 28px rgba(0,0,0,0.35)",
  lg: "0 16px 48px rgba(0,0,0,0.45)",
} as const;

export function CardView({
  title,
  body,
  code,
  headerExtra,
  variant,
  radius,
  shadow,
  blur,
  padding,
  isHoverable,
  fullWidth,
  children,
}: CardViewProps) {
  return (
    <div
      className={`kp-uicard kp-uicard--${variant} ${isHoverable ? "kp-uicard--hoverable" : ""}`}
      style={{
        borderRadius: RADII[radius],
        boxShadow: SHADOWS[shadow],
        padding,
        width: fullWidth ? "100%" : "fit-content",
        backdropFilter: variant === "glass" ? `blur(${blur}px) saturate(160%)` : undefined,
        WebkitBackdropFilter: variant === "glass" ? `blur(${blur}px) saturate(160%)` : undefined,
      }}
    >
      {title || headerExtra ? (
        <header className="kp-uicard__header">
          {title ? <h3 className="kp-uicard__title">{title}</h3> : <span />}
          {headerExtra}
        </header>
      ) : null}
      {code ? <pre className="kp-uicard__code">{code}</pre> : null}
      {body
        ? body.split("\n\n").map((paragraph, i) => (
            <p key={i} className="kp-uicard__body">
              {paragraph}
            </p>
          ))
        : null}
      {children}
    </div>
  );
}
