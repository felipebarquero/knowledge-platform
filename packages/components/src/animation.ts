import { animate } from "animejs";
import type { AnimationDef } from "@knowledge/ir";

/**
 * Animation layer executor. The IR stays declarative ({ entrance, duration,
 * delay, easing }); anime.js performs it. Easing names use anime.js v4
 * vocabulary ("outQuad", "outExpo", …).
 */

export const ENTRANCES = ["none", "fade", "slide-up", "scale-in", "rise"] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const EASINGS = [
  "linear",
  "outQuad",
  "inOutQuad",
  "outCubic",
  "outExpo",
  "outBack",
  "outElastic",
] as const;

/** "400ms" | "0.4s" | "400" → milliseconds; anything else → fallback. */
export function parseDuration(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^([\d.]+)\s*(ms|s)?$/.exec(value.trim());
  if (!match || match[1] === undefined) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  return match[2] === "s" ? amount * 1000 : amount;
}

/** Declarative entrance name → anime.js animatable properties. */
export function entranceParams(entrance: string | undefined): Record<string, unknown> | null {
  switch (entrance) {
    case "fade":
      return { opacity: [0, 1] };
    case "slide-up":
      return { opacity: [0, 1], translateY: [24, 0] };
    case "scale-in":
      return { opacity: [0, 1], scale: [0.94, 1] };
    case "rise":
      return { opacity: [0, 1], translateY: [36, 0] };
    default:
      return null;
  }
}

/** Run a component's entrance animation. No-op for "none", SSR, or reduced motion. */
export function playEntrance(element: HTMLElement, def: AnimationDef | undefined): void {
  if (!def) return;
  const params = entranceParams(def.entrance);
  if (!params) return;
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  animate(element, {
    ...params,
    duration: parseDuration(def.duration, 500),
    delay: parseDuration(def.delay, 0),
    ease: def.easing ?? "outQuad",
  });
}
