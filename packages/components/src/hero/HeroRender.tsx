import type { ReactNode } from "react";

/**
 * Presentational renderers for the HeroUI component family. Styling is
 * attribute-driven (data-color / data-variant / data-size / data-radius) and
 * resolved in renderer-web/styles.css against HeroUI's default color tokens —
 * so a component's full prop surface maps to CSS without a per-combination
 * explosion in JS. Overlay components (modal/popover/tooltip/drawer) render in
 * their open/visible state for authoring and preview.
 */

type Opts = Record<string, unknown>;

const s = (o: Opts, k: string, d = ""): string => (typeof o[k] === "string" ? (o[k] as string) : d);
const n = (o: Opts, k: string, d = 0): number => (typeof o[k] === "number" ? (o[k] as number) : d);
const b = (o: Opts, k: string, d = false): boolean => (typeof o[k] === "boolean" ? (o[k] as boolean) : d);
const list = (o: Opts, k: string): string[] =>
  s(o, k)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function data(o: Opts, extra: Record<string, string | undefined> = {}) {
  return {
    "data-color": s(o, "color", "default"),
    "data-variant": s(o, "variant", "solid"),
    "data-size": s(o, "size", "md"),
    "data-radius": s(o, "radius", "md"),
    ...extra,
  };
}

const KEY_GLYPH: Record<string, string> = {
  command: "⌘",
  cmd: "⌘",
  shift: "⇧",
  ctrl: "⌃",
  control: "⌃",
  option: "⌥",
  alt: "⌥",
  enter: "↵",
  escape: "⎋",
  esc: "⎋",
  delete: "⌫",
  tab: "⇥",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function HeroRender({ type, o }: { type: string; o: Opts }): ReactNode {
  switch (type) {
    case "button":
      return (
        <button
          type="button"
          className={`hui hui-btn ${b(o, "fullWidth") ? "hui-btn--full" : ""} ${b(o, "isIconOnly") ? "hui-btn--icon" : ""}`}
          disabled={b(o, "isDisabled")}
          {...data(o)}
        >
          {b(o, "isLoading") && <span className="hui-spinner hui-spinner--inline" aria-hidden="true" />}
          {b(o, "isIconOnly") ? "★" : s(o, "label", "Button")}
        </button>
      );

    case "snippet":
      return (
        <div className="hui hui-snippet" {...data(o)}>
          {!b(o, "hideSymbol") && <span className="hui-snippet__sym">{s(o, "symbol", "$")}</span>}
          <code className="hui-snippet__cmd">{s(o, "command", "npm i @heroui/react")}</code>
          {!b(o, "hideCopyButton") && (
            <button type="button" className="hui-snippet__copy" aria-label="copy">
              ⧉
            </button>
          )}
        </div>
      );

    case "chip":
      return (
        <span className="hui hui-chip" {...data(o)}>
          {s(o, "variant") === "dot" && <i className="hui-chip__dot" />}
          {s(o, "label", "Chip")}
          {b(o, "isCloseable") && <button type="button" className="hui-chip__close" aria-label="close">×</button>}
        </span>
      );

    case "badge":
      return (
        <span className="hui-badge-wrap" data-placement={s(o, "placement", "top-right")}>
          <span className="hui-badge-anchor" aria-hidden="true" />
          <span
            className={`hui hui-badge ${b(o, "showOutline", true) ? "hui-badge--outline" : ""} ${b(o, "isDot") ? "hui-badge--dot" : ""}`}
            {...data(o)}
          >
            {b(o, "isDot") ? "" : s(o, "content", "5")}
          </span>
        </span>
      );

    case "avatar": {
      const src = s(o, "src");
      return (
        <span
          className={`hui hui-avatar ${b(o, "isBordered") ? "hui-avatar--bordered" : ""} ${b(o, "isDisabled") ? "hui-avatar--disabled" : ""}`}
          {...data(o)}
        >
          {src ? <img src={src} alt={s(o, "name", "avatar")} /> : initials(s(o, "name", "?"))}
        </span>
      );
    }

    case "user": {
      const src = s(o, "src");
      return (
        <div className="hui hui-user" {...data(o)}>
          <span className={`hui hui-avatar ${b(o, "isBordered") ? "hui-avatar--bordered" : ""}`} data-size="md" data-radius="full" data-color={s(o, "color", "default")}>
            {src ? <img src={src} alt={s(o, "name", "avatar")} /> : initials(s(o, "name", "?"))}
          </span>
          <span className="hui-user__meta">
            <span className="hui-user__name">{s(o, "name", "Jane Doe")}</span>
            <span className="hui-user__desc">{s(o, "description", "@janedoe")}</span>
          </span>
        </div>
      );
    }

    case "image": {
      const src = s(o, "src");
      return (
        <div
          className={`hui hui-image ${b(o, "isBlurred") ? "hui-image--blurred" : ""} ${b(o, "isZoomed") ? "hui-image--zoomed" : ""}`}
          data-radius={s(o, "radius", "lg")}
          style={{ width: n(o, "width", 320), height: n(o, "height", 180) }}
        >
          {src ? <img src={src} alt={s(o, "alt", "image")} /> : <span className="hui-image__ph">🖼</span>}
        </div>
      );
    }

    case "link":
      return (
        <a
          className="hui hui-link"
          href={s(o, "href", "#")}
          data-color={s(o, "color", "primary")}
          data-size={s(o, "size", "md")}
          data-underline={s(o, "underline", "hover")}
          data-block={b(o, "isBlock") ? "true" : undefined}
        >
          {s(o, "label", "Visit HeroUI")}
          {b(o, "isExternal") && <span aria-hidden="true"> ↗</span>}
        </a>
      );

    case "kbd": {
      const keys = list(o, "keys");
      return (
        <kbd className="hui hui-kbd">
          {keys.map((k) => (
            <abbr key={k} title={k}>
              {KEY_GLYPH[k.toLowerCase()] ?? k.toUpperCase()}
            </abbr>
          ))}
          {s(o, "label") && <span className="hui-kbd__label">{s(o, "label")}</span>}
        </kbd>
      );
    }

    case "divider":
      return <span className="hui hui-divider" data-orientation={s(o, "orientation", "horizontal")} role="separator" />;

    case "spacer":
      return <span className="hui-spacer" style={{ width: n(o, "x", 0) * 4, height: n(o, "y", 4) * 4 }} aria-hidden="true" />;

    case "skeleton":
      return b(o, "isLoaded") ? (
        <div className="hui-skeleton-loaded" style={{ width: n(o, "width", 240) }}>
          content loaded
        </div>
      ) : (
        <span
          className="hui hui-skeleton"
          data-radius={s(o, "radius", "md")}
          style={{ width: n(o, "width", 240), height: n(o, "height", 16) }}
        />
      );

    case "spinner":
      return (
        <span className="hui hui-spinner-block" data-color={s(o, "color", "primary")} data-size={s(o, "size", "md")} data-variant={s(o, "variant", "default")}>
          {s(o, "variant") === "dots" ? (
            <span className="hui-spinner-dots"><i /><i /><i /></span>
          ) : (
            <span className="hui-spinner" />
          )}
          {s(o, "label") && <span className="hui-spinner__label">{s(o, "label")}</span>}
        </span>
      );

    case "progress": {
      const value = b(o, "isIndeterminate") ? null : Math.max(0, Math.min(100, n(o, "value", 60)));
      return (
        <div className="hui hui-progress" data-color={s(o, "color", "primary")} data-size={s(o, "size", "md")} data-radius={s(o, "radius", "full")}>
          {(s(o, "label") || b(o, "showValueLabel", true)) && (
            <div className="hui-progress__labels">
              <span>{s(o, "label", "")}</span>
              {b(o, "showValueLabel", true) && value !== null && <span>{value}%</span>}
            </div>
          )}
          <div className="hui-progress__track">
            <div
              className={`hui-progress__bar ${b(o, "isStriped") ? "hui-progress__bar--striped" : ""} ${value === null ? "hui-progress__bar--indeterminate" : ""}`}
              style={value === null ? undefined : { width: `${value}%` }}
            />
          </div>
        </div>
      );
    }

    case "circular_progress": {
      const value = Math.max(0, Math.min(100, n(o, "value", 70)));
      const stroke = n(o, "strokeWidth", 3);
      const r = 18 - stroke;
      const circ = 2 * Math.PI * r;
      return (
        <div className="hui hui-circular" data-color={s(o, "color", "primary")} data-size={s(o, "size", "md")}>
          <svg viewBox="0 0 40 40" className="hui-circular__svg">
            <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth={stroke} opacity={0.2} />
            <circle
              cx="20"
              cy="20"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - value / 100)}
              transform="rotate(-90 20 20)"
            />
          </svg>
          {b(o, "showValueLabel", true) && <span className="hui-circular__label">{value}%</span>}
          {s(o, "label") && <span className="hui-circular__caption">{s(o, "label")}</span>}
        </div>
      );
    }

    case "input":
    case "autocomplete": {
      const placement = s(o, "labelPlacement", "inside");
      return (
        <label className="hui hui-field" data-label={placement} {...data(o)}>
          {placement !== "inside" && s(o, "label") && <span className="hui-field__label">{s(o, "label")}</span>}
          <span className="hui-field__wrap">
            {placement === "inside" && s(o, "label") && <span className="hui-field__label hui-field__label--inside">{s(o, "label")}</span>}
            <span className="hui-field__control">
              <span className="hui-field__placeholder">{s(o, "placeholder", "")}</span>
              {b(o, "isClearable") && <span className="hui-field__clear">×</span>}
              {type === "autocomplete" && <span className="hui-field__chevron">▾</span>}
            </span>
          </span>
          {s(o, "description") && <span className="hui-field__desc">{s(o, "description")}</span>}
          {type === "autocomplete" && (
            <span className="hui-menu hui-field__menu">
              {list(o, "items").map((it) => (
                <span key={it} className="hui-menu__item">{it}</span>
              ))}
            </span>
          )}
        </label>
      );
    }

    case "textarea":
      return (
        <label className="hui hui-field" data-label="inside" {...data(o)}>
          <span className="hui-field__wrap">
            {s(o, "label") && <span className="hui-field__label hui-field__label--inside">{s(o, "label")}</span>}
            <span className="hui-field__control hui-field__control--area" style={{ minHeight: `${n(o, "minRows", 3) * 1.5}em` }}>
              <span className="hui-field__placeholder">{s(o, "placeholder", "")}</span>
            </span>
          </span>
        </label>
      );

    case "number_input":
      return (
        <label className="hui hui-field" data-label="inside" {...data(o)}>
          <span className="hui-field__wrap">
            {s(o, "label") && <span className="hui-field__label hui-field__label--inside">{s(o, "label")}</span>}
            <span className="hui-field__control">
              <span className="hui-field__value">{n(o, "min", 0)}</span>
              {!b(o, "hideStepper") && (
                <span className="hui-stepper">
                  <button type="button">▲</button>
                  <button type="button">▼</button>
                </span>
              )}
            </span>
          </span>
        </label>
      );

    case "checkbox":
      return (
        <label className="hui hui-checkbox" data-color={s(o, "color", "primary")} data-size={s(o, "size", "md")} data-radius={s(o, "radius", "md")} data-disabled={b(o, "isDisabled") ? "true" : undefined}>
          <span className={`hui-checkbox__box ${b(o, "isSelected", true) ? "hui-checkbox__box--on" : ""}`}>{b(o, "isSelected", true) ? "✓" : ""}</span>
          <span className={b(o, "lineThrough") && b(o, "isSelected", true) ? "hui-checkbox__label--through" : ""}>{s(o, "label", "Checkbox")}</span>
        </label>
      );

    case "radio_group":
      return (
        <fieldset className="hui hui-radiogroup" data-color={s(o, "color", "primary")} data-size={s(o, "size", "md")} data-orientation={s(o, "orientation", "vertical")} disabled={b(o, "isDisabled")}>
          {s(o, "label") && <legend className="hui-radiogroup__label">{s(o, "label")}</legend>}
          <div className="hui-radiogroup__items">
            {list(o, "options").map((opt, i) => (
              <label key={opt} className="hui-radio">
                <span className={`hui-radio__dot ${i === 0 ? "hui-radio__dot--on" : ""}`} />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>
      );

    case "input_otp": {
      const len = Math.max(3, Math.min(8, n(o, "length", 4)));
      const value = s(o, "value");
      return (
        <div className="hui hui-otp" {...data(o)}>
          {Array.from({ length: len }).map((_, i) => (
            <span key={i} className={`hui-otp__cell ${i === value.length ? "hui-otp__cell--active" : ""}`}>
              {value[i] ?? ""}
            </span>
          ))}
        </div>
      );
    }

    case "alert":
      return (
        <div className="hui hui-alert" data-color={s(o, "color", "primary")} data-variant={s(o, "variant", "flat")} data-radius={s(o, "radius", "md")} role="alert">
          {!b(o, "hideIcon") && <span className="hui-alert__icon" aria-hidden="true">!</span>}
          <div className="hui-alert__body">
            <strong className="hui-alert__title">{s(o, "title", "Heads up!")}</strong>
            {s(o, "description") && <span className="hui-alert__desc">{s(o, "description")}</span>}
          </div>
          {b(o, "isClosable") && <button type="button" className="hui-alert__close" aria-label="close">×</button>}
        </div>
      );

    case "tooltip":
      return (
        <span className="hui-tooltip-wrap">
          <button type="button" className="hui hui-btn" data-variant="flat" data-color="default" data-size="md" data-radius="md">
            {s(o, "label", "Hover me")}
          </button>
          <span className="hui hui-tooltip" data-color={s(o, "color", "default")} data-size={s(o, "size", "md")} data-radius={s(o, "radius", "md")} data-placement={s(o, "placement", "top")}>
            {b(o, "showArrow", true) && <span className="hui-tooltip__arrow" />}
            {s(o, "content", "I am a tooltip")}
          </span>
        </span>
      );

    case "popover":
      return (
        <span className="hui-popover-wrap">
          <button type="button" className="hui hui-btn" data-variant="flat" data-color="default" data-size="md" data-radius="md">
            {s(o, "label", "Open popover")}
          </button>
          <span className="hui hui-popover" data-color={s(o, "color", "default")} data-size={s(o, "size", "md")} data-radius={s(o, "radius", "md")} data-placement={s(o, "placement", "bottom")}>
            {b(o, "showArrow", true) && <span className="hui-popover__arrow" />}
            {s(o, "title") && <strong className="hui-popover__title">{s(o, "title")}</strong>}
            <span className="hui-popover__content">{s(o, "content", "Popover content goes here.")}</span>
          </span>
        </span>
      );

    case "modal":
      return (
        <div className={`hui-modal-backdrop hui-modal-backdrop--${s(o, "backdrop", "blur")}`}>
          <div className="hui hui-modal" data-size={s(o, "modalSize", "md")} data-radius={s(o, "radius", "lg")} role="dialog">
            <header className="hui-modal__head">
              <strong>{s(o, "title", "Modal title")}</strong>
              <button type="button" className="hui-modal__close" aria-label="close">×</button>
            </header>
            <div className="hui-modal__body">{s(o, "body", "Modal body content.")}</div>
            <footer className="hui-modal__foot">
              <button type="button" className="hui hui-btn" data-variant="light" data-color="danger" data-size="sm" data-radius="md">Close</button>
              <button type="button" className="hui hui-btn" data-variant="solid" data-color="primary" data-size="sm" data-radius="md">Action</button>
            </footer>
          </div>
        </div>
      );

    case "toast":
      return (
        <div className="hui hui-toast" data-color={s(o, "color", "default")} data-variant={s(o, "variant", "flat")} data-radius={s(o, "radius", "md")} role="status">
          <span className="hui-toast__icon" aria-hidden="true">✓</span>
          <div className="hui-toast__body">
            <strong>{s(o, "title", "Saved")}</strong>
            {s(o, "description") && <span>{s(o, "description")}</span>}
          </div>
          <button type="button" className="hui-toast__close" aria-label="close">×</button>
        </div>
      );

    case "drawer":
      return (
        <div className="hui-modal-backdrop hui-modal-backdrop--blur">
          <div className={`hui hui-drawer hui-drawer--${s(o, "placement", "right")}`} data-size={s(o, "drawerSize", "md")} role="dialog">
            <header className="hui-modal__head">
              <strong>{s(o, "title", "Drawer title")}</strong>
              <button type="button" className="hui-modal__close" aria-label="close">×</button>
            </header>
            <div className="hui-modal__body">{s(o, "body", "Drawer body content.")}</div>
          </div>
        </div>
      );

    case "accordion": {
      const items = list(o, "items");
      return (
        <div className={`hui hui-accordion hui-accordion--${s(o, "variant", "light")} ${b(o, "compact") ? "hui-accordion--compact" : ""}`}>
          {items.map((it, i) => (
            <div key={it} className="hui-accordion__item">
              <button type="button" className="hui-accordion__head">
                <span>{it}</span>
                <span className="hui-accordion__chevron">{i === 0 ? "▾" : "▸"}</span>
              </button>
              {i === 0 && <div className="hui-accordion__panel">{s(o, "body", "Section content goes here.")}</div>}
            </div>
          ))}
        </div>
      );
    }

    case "tabs": {
      const items = list(o, "items");
      return (
        <div className={`hui hui-tabs ${b(o, "fullWidth") ? "hui-tabs--full" : ""}`} data-variant={s(o, "variant", "solid")} data-color={s(o, "color", "default")} data-size={s(o, "size", "md")} data-radius={s(o, "radius", "md")} data-placement={s(o, "placement", "top")}>
          {items.map((it, i) => (
            <button key={it} type="button" className={`hui-tab ${i === 0 ? "hui-tab--active" : ""}`}>
              {it}
            </button>
          ))}
        </div>
      );
    }

    case "breadcrumbs": {
      const items = list(o, "items");
      return (
        <nav className="hui hui-breadcrumbs" data-color={s(o, "color", "default")} data-size={s(o, "size", "md")} data-underline={s(o, "underline", "none")}>
          {items.map((it, i) => (
            <span key={it} className="hui-breadcrumbs__item">
              <a href="#" aria-current={i === items.length - 1 ? "page" : undefined}>{it}</a>
              {i < items.length - 1 && <span className="hui-breadcrumbs__sep">{s(o, "separator", "/")}</span>}
            </span>
          ))}
        </nav>
      );
    }

    case "pagination": {
      const total = Math.max(1, n(o, "total", 10));
      const active = Math.max(1, Math.min(total, n(o, "page", 1)));
      const pages = total <= 7 ? Array.from({ length: total }, (_, i) => i + 1) : [1, 2, 3, "…", total - 1, total];
      return (
        <nav className={`hui hui-pagination ${b(o, "isCompact") ? "hui-pagination--compact" : ""}`} data-variant={s(o, "variant", "flat")} data-color={s(o, "color", "primary")} data-size={s(o, "size", "md")} data-radius={s(o, "radius", "md")}>
          {b(o, "showControls", true) && <button type="button" className="hui-pagination__ctrl">‹</button>}
          {pages.map((p, i) => (
            <button key={i} type="button" className={`hui-pagination__page ${p === active ? "hui-pagination__page--active" : ""}`} disabled={p === "…"}>
              {p}
            </button>
          ))}
          {b(o, "showControls", true) && <button type="button" className="hui-pagination__ctrl">›</button>}
        </nav>
      );
    }

    case "navbar":
      return (
        <nav className={`hui hui-navbar ${b(o, "isBordered", true) ? "hui-navbar--bordered" : ""}`}>
          <span className="hui-navbar__brand">{s(o, "brand", "ACME")}</span>
          <span className="hui-navbar__items">
            {list(o, "items").map((it, i) => (
              <a key={it} href="#" className={i === 0 ? "hui-navbar__link hui-navbar__link--active" : "hui-navbar__link"}>{it}</a>
            ))}
          </span>
          {b(o, "showActions", true) && (
            <span className="hui-navbar__actions">
              <button type="button" className="hui hui-btn" data-variant="light" data-color="default" data-size="sm" data-radius="md">Login</button>
              <button type="button" className="hui hui-btn" data-variant="flat" data-color="primary" data-size="sm" data-radius="md">Sign up</button>
            </span>
          )}
        </nav>
      );

    case "listbox":
      return (
        <div className="hui hui-menu hui-listbox" data-color={s(o, "color", "default")} data-variant={s(o, "variant", "flat")}>
          {s(o, "label") && <span className="hui-menu__title">{s(o, "label")}</span>}
          {list(o, "items").map((it) => (
            <span key={it} className={`hui-menu__item ${it.toLowerCase() === "delete" ? "hui-menu__item--danger" : ""}`}>{it}</span>
          ))}
        </div>
      );

    case "dropdown":
      return (
        <div className="hui-dropdown-wrap">
          <button type="button" className="hui hui-btn" data-variant="flat" data-color="default" data-size="md" data-radius="md">
            {s(o, "label", "Open menu")} ▾
          </button>
          <div className="hui hui-menu hui-dropdown__menu" data-color={s(o, "color", "default")} data-variant={s(o, "variant", "flat")}>
            {list(o, "items").map((it) => (
              <span key={it} className={`hui-menu__item ${/log out|delete/i.test(it) ? "hui-menu__item--danger" : ""}`}>{it}</span>
            ))}
          </div>
        </div>
      );

    case "scroll_shadow":
      return (
        <div className="hui hui-scrollshadow" data-orientation={s(o, "orientation", "vertical")} style={{ maxHeight: n(o, "scrollHeight", 160) }}>
          <div className="hui-scrollshadow__content">
            {Array.from({ length: 14 }).map((_, i) => (
              <p key={i}>{s(o, "body", "Long scrollable content…")} — line {i + 1}</p>
            ))}
          </div>
        </div>
      );

    case "calendar": {
      const selected = n(o, "selectedDay", 7);
      return (
        <div className="hui hui-calendar" data-color={s(o, "color", "primary")}>
          <header className="hui-calendar__head">
            <button type="button">‹</button>
            <strong>{s(o, "month", "August 2024")}</strong>
            <button type="button">›</button>
          </header>
          <div className="hui-calendar__grid">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <span key={d} className="hui-calendar__dow">{d}</span>
            ))}
            {Array.from({ length: 31 }).map((_, i) => (
              <span key={i} className={`hui-calendar__day ${i + 1 === selected ? "hui-calendar__day--selected" : ""}`}>{i + 1}</span>
            ))}
          </div>
        </div>
      );
    }

    case "date_input":
      return (
        <label className="hui hui-field" data-label="inside" {...data(o)}>
          <span className="hui-field__wrap">
            {s(o, "label") && <span className="hui-field__label hui-field__label--inside">{s(o, "label")}</span>}
            <span className="hui-field__control">
              <span className="hui-field__value hui-date">{s(o, "value", "2024 / 08 / 07")}</span>
              <span className="hui-field__chevron">▦</span>
            </span>
          </span>
        </label>
      );

    default:
      return <div className="kp-component__canvas"><span>HeroUI “{type}” not implemented</span></div>;
  }
}
