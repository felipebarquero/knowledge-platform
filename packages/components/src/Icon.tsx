import { useEffect, useState } from "react";
import { Icon as IconifyIcon } from "@iconify/react";

/**
 * Icon rendering, powered by Iconify's offline collections (lucide for UI +
 * logos for brand/cloud icons — ~3.9k icons). The collections are lazy-loaded
 * and code-split, so the icon data never weighs down the main chunk; the first
 * `<Icon>` (or the workshop picker) triggers a one-time registration. Icons are
 * referenced declaratively by name in the IR, e.g. `options.icon: "logos:aws-lambda"`.
 */

type Collection = { prefix: string; icons: Record<string, unknown> };

let catalogPromise: Promise<string[]> | null = null;

/** Lazy-load + register the offline collections; resolves to all icon names. */
export function loadIconCatalog(): Promise<string[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [{ addCollection }, lucide, logos] = await Promise.all([
        import("@iconify/react"),
        import("@iconify-json/lucide/icons.json"),
        import("@iconify-json/logos/icons.json"),
      ]);
      addCollection(lucide.default);
      addCollection(logos.default);
      const names = (c: Collection) => Object.keys(c.icons).map((n) => `${c.prefix}:${n}`);
      return [...names(lucide.default), ...names(logos.default)];
    })();
  }
  return catalogPromise;
}

export interface IconProps {
  /** Iconify name, e.g. "lucide:database" or "logos:aws-dynamodb". */
  icon: string;
  size?: number | string;
  color?: string;
  className?: string;
}

export function Icon({ icon, size = "1em", color, className }: IconProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadIconCatalog().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  if (!icon) return null;
  // Reserve the box until the offline collection is registered (no layout shift).
  if (!ready) {
    return (
      <span
        className={className}
        style={{ display: "inline-block", width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  return <IconifyIcon icon={icon} width={size} height={size} color={color} className={className} />;
}
