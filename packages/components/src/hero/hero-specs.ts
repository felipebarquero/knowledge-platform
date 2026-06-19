import type { OptionSpec } from "../option-specs";

/**
 * HeroUI component catalog — props scraped from the HeroUI theme source
 * (github.com/heroui-inc/heroui, packages/core/theme/src/components) and the
 * component docs. Each entry publishes its full customizable parameter surface
 * as OptionSpecs, so the workshop's Figma-style inspector and the wizard
 * catalog are generated from this one declarative table.
 *
 * Components that already exist in the platform are intentionally omitted:
 * card, code, table (datatable), select, slider, switch (toggle).
 */

export interface HeroMeta {
  /** Wizard catalog group. */
  group: string;
  /** Catalog label (Title Case). */
  label: string;
  description: string;
  specs: OptionSpec[];
  /** Default option values seeded when the component is created. */
  seed?: Record<string, unknown>;
}

/* ── Shared HeroUI prop vocabularies (cleaned of theme slot-names) ──── */

const COLORS = ["default", "primary", "secondary", "success", "warning", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;
const RADII = ["none", "sm", "md", "lg", "full"] as const;

const G_STYLE = "Style";
const G_CONTENT = "Content";
const G_STATE = "State";
const G_LAYOUT = "Layout";

const color = (group = G_STYLE, def = "default"): OptionSpec => ({
  key: "color",
  label: "color",
  control: "select",
  group,
  default: def,
  choices: COLORS,
});

const size = (group = G_STYLE, def = "md"): OptionSpec => ({
  key: "size",
  label: "size",
  control: "select",
  group,
  default: def,
  choices: SIZES,
});

const radius = (group = G_STYLE, def = "md"): OptionSpec => ({
  key: "radius",
  label: "radius",
  control: "select",
  group,
  default: def,
  choices: RADII,
});

const variant = (choices: readonly string[], def: string, group = G_STYLE): OptionSpec => ({
  key: "variant",
  label: "variant",
  control: "select",
  group,
  default: def,
  choices,
});

const toggle = (key: string, label: string, def = false, group = G_STATE): OptionSpec => ({
  key,
  label,
  control: "toggle",
  group,
  default: def,
});

const text = (key: string, label: string, def: string, group = G_CONTENT): OptionSpec => ({
  key,
  label,
  control: "text",
  group,
  default: def,
});

const range = (
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step = 1,
  group = G_LAYOUT,
): OptionSpec => ({ key, label, control: "range", group, default: def, min, max, step });

const select = (
  key: string,
  label: string,
  choices: readonly string[],
  def: string,
  group = G_STYLE,
): OptionSpec => ({ key, label, control: "select", group, default: def, choices });

const BUTTON_VARIANTS = ["solid", "bordered", "light", "flat", "faded", "shadow", "ghost"] as const;

/* ── The catalog ─────────────────────────────────────────────────────── */

export const HERO_COMPONENTS: Record<string, HeroMeta> = {
  // ── Actions ──────────────────────────────────────────────────────────
  button: {
    group: "HeroUI · Actions",
    label: "Button",
    description: "Pressable action with HeroUI variants, colors and sizes",
    specs: [
      variant(BUTTON_VARIANTS, "solid"),
      color(),
      size(),
      radius(G_STYLE, "lg"),
      text("label", "label", "Button"),
      { key: "icon", label: "icon", control: "icon", group: G_CONTENT, default: "" },
      toggle("isDisabled", "disabled"),
      toggle("isLoading", "loading"),
      toggle("fullWidth", "full width"),
      toggle("isIconOnly", "icon only"),
    ],
    seed: { label: "Button" },
  },
  snippet: {
    group: "HeroUI · Actions",
    label: "Snippet",
    description: "Inline command with a copy button",
    specs: [
      variant(["flat", "solid", "bordered", "shadow"], "flat"),
      color(),
      size(),
      radius(),
      text("command", "command", "npm i @heroui/react"),
      text("symbol", "symbol", "$"),
      toggle("hideSymbol", "hide symbol"),
      toggle("hideCopyButton", "hide copy"),
    ],
    seed: { command: "npm i @heroui/react", symbol: "$" },
  },

  // ── Data display ──────────────────────────────────────────────────────
  chip: {
    group: "HeroUI · Display",
    label: "Chip",
    description: "Compact label / tag, optionally closable with a dot",
    specs: [
      variant(["solid", "bordered", "light", "flat", "faded", "shadow", "dot"], "solid"),
      color(),
      size(),
      radius(G_STYLE, "full"),
      text("label", "text", "Chip"),
      { key: "icon", label: "icon", control: "icon", group: G_CONTENT, default: "" },
      toggle("isCloseable", "closeable"),
    ],
    seed: { label: "Chip" },
  },
  badge: {
    group: "HeroUI · Display",
    label: "Badge",
    description: "Numeric / dot badge anchored to a child element",
    specs: [
      variant(["solid", "flat", "faded", "shadow"], "solid"),
      color(G_STYLE, "danger"),
      size(),
      select("placement", "placement", ["top-right", "top-left", "bottom-right", "bottom-left"], "top-right"),
      text("content", "content", "5"),
      toggle("showOutline", "outline", true),
      toggle("isDot", "dot only"),
    ],
    seed: { content: "5", color: "danger" },
  },
  avatar: {
    group: "HeroUI · Display",
    label: "Avatar",
    description: "User image or initials with HeroUI sizes and colors",
    specs: [
      size(),
      color(),
      radius(G_STYLE, "full"),
      text("name", "name", "Jane Doe"),
      text("src", "image src", ""),
      toggle("isBordered", "bordered"),
      toggle("isDisabled", "disabled"),
    ],
    seed: { name: "Jane Doe" },
  },
  user: {
    group: "HeroUI · Display",
    label: "User",
    description: "Avatar paired with a name and description",
    specs: [
      text("name", "name", "Jane Doe"),
      text("description", "description", "@janedoe"),
      text("src", "avatar src", ""),
      color(G_STYLE, "default"),
      toggle("isBordered", "bordered avatar"),
    ],
    seed: { name: "Jane Doe", description: "@janedoe" },
  },
  image: {
    group: "HeroUI · Display",
    label: "Image",
    description: "Image with radius, zoom and blur options",
    specs: [
      radius(),
      text("src", "src", ""),
      text("alt", "alt", "image"),
      range("width", "width", 320, 80, 640, 10),
      range("height", "height", 180, 60, 480, 10),
      toggle("isBlurred", "blurred shadow"),
      toggle("isZoomed", "zoom on hover"),
    ],
  },
  link: {
    group: "HeroUI · Display",
    label: "Link",
    description: "Anchor with HeroUI color and underline behavior",
    specs: [
      color(G_STYLE, "primary"),
      size(),
      select("underline", "underline", ["none", "hover", "always", "active", "focus"], "hover"),
      text("label", "text", "Visit HeroUI"),
      text("href", "href", "#"),
      toggle("isExternal", "external"),
      toggle("isBlock", "block highlight"),
    ],
    seed: { label: "Visit HeroUI", href: "#" },
  },
  kbd: {
    group: "HeroUI · Display",
    label: "Keyboard Key",
    description: "Keyboard shortcut hint (⌘ K)",
    specs: [text("keys", "keys (comma)", "command,K"), text("label", "label", "")],
    seed: { keys: "command,K" },
  },
  divider: {
    group: "HeroUI · Display",
    label: "Divider",
    description: "Thin separator, horizontal or vertical",
    specs: [select("orientation", "orientation", ["horizontal", "vertical"], "horizontal")],
  },
  spacer: {
    group: "HeroUI · Display",
    label: "Spacer",
    description: "Empty spacing primitive (x / y units)",
    specs: [range("x", "x", 0, 0, 24, 1), range("y", "y", 4, 0, 24, 1)],
  },
  skeleton: {
    group: "HeroUI · Display",
    label: "Skeleton",
    description: "Loading placeholder shimmer",
    specs: [
      radius(),
      range("width", "width", 240, 40, 600, 10),
      range("height", "height", 16, 8, 200, 2),
      toggle("isLoaded", "loaded"),
    ],
  },
  spinner: {
    group: "HeroUI · Feedback",
    label: "Spinner",
    description: "Loading indicator with HeroUI variants",
    specs: [
      variant(["default", "gradient", "wave", "dots", "spinner", "simple"], "default"),
      color(G_STYLE, "primary"),
      size(),
      text("label", "label", ""),
    ],
  },
  progress: {
    group: "HeroUI · Feedback",
    label: "Progress",
    description: "Linear progress bar",
    specs: [
      color(G_STYLE, "primary"),
      size(),
      radius(G_STYLE, "full"),
      range("value", "value", 60, 0, 100, 1, G_CONTENT),
      text("label", "label", "Loading…"),
      toggle("showValueLabel", "value label", true),
      toggle("isStriped", "striped"),
      toggle("isIndeterminate", "indeterminate"),
    ],
    seed: { value: 60, label: "Loading…" },
  },
  circular_progress: {
    group: "HeroUI · Feedback",
    label: "Circular Progress",
    description: "Radial progress ring",
    specs: [
      color(G_STYLE, "primary"),
      size(),
      range("value", "value", 70, 0, 100, 1, G_CONTENT),
      range("strokeWidth", "stroke", 3, 1, 8, 0.5),
      text("label", "label", ""),
      toggle("showValueLabel", "value label", true),
    ],
    seed: { value: 70 },
  },

  // ── Inputs & forms ────────────────────────────────────────────────────
  input: {
    group: "HeroUI · Inputs",
    label: "Input",
    description: "Text field with HeroUI variants and label placement",
    specs: [
      variant(["flat", "faded", "bordered", "underlined"], "flat"),
      color(),
      size(),
      radius(),
      select("labelPlacement", "label placement", ["inside", "outside", "outside-left"], "inside"),
      text("label", "label", "Email"),
      text("placeholder", "placeholder", "you@example.com"),
      text("description", "description", ""),
      toggle("isClearable", "clearable"),
      toggle("isRequired", "required"),
      toggle("isDisabled", "disabled"),
    ],
    seed: { label: "Email", placeholder: "you@example.com" },
  },
  textarea: {
    group: "HeroUI · Inputs",
    label: "Textarea",
    description: "Multi-line text field",
    specs: [
      variant(["flat", "faded", "bordered", "underlined"], "flat"),
      color(),
      size(),
      radius(),
      text("label", "label", "Message"),
      text("placeholder", "placeholder", "Type here…"),
      range("minRows", "min rows", 3, 1, 12, 1, G_LAYOUT),
    ],
    seed: { label: "Message", placeholder: "Type here…" },
  },
  number_input: {
    group: "HeroUI · Inputs",
    label: "Number Input",
    description: "Numeric field with stepper buttons",
    specs: [
      variant(["flat", "faded", "bordered", "underlined"], "flat"),
      color(),
      size(),
      radius(),
      text("label", "label", "Quantity"),
      range("min", "min", 0, -100, 100, 1, G_CONTENT),
      range("max", "max", 100, 0, 1000, 1, G_CONTENT),
      range("step", "step", 1, 1, 50, 1, G_CONTENT),
      toggle("hideStepper", "hide stepper"),
    ],
    seed: { label: "Quantity" },
  },
  checkbox: {
    group: "HeroUI · Inputs",
    label: "Checkbox",
    description: "Single checkbox with HeroUI colors",
    specs: [
      color(G_STYLE, "primary"),
      size(),
      radius(),
      text("label", "label", "Accept terms"),
      toggle("isSelected", "selected", true),
      toggle("isDisabled", "disabled"),
      toggle("lineThrough", "line through"),
    ],
    seed: { label: "Accept terms" },
  },
  radio_group: {
    group: "HeroUI · Inputs",
    label: "Radio Group",
    description: "Group of radio options",
    specs: [
      color(G_STYLE, "primary"),
      size(),
      select("orientation", "orientation", ["vertical", "horizontal"], "vertical"),
      text("label", "label", "Plan"),
      text("options", "options (comma)", "Free,Pro,Team"),
      toggle("isDisabled", "disabled"),
    ],
    seed: { label: "Plan", options: "Free,Pro,Team" },
  },
  input_otp: {
    group: "HeroUI · Inputs",
    label: "Input OTP",
    description: "One-time-passcode segmented input",
    specs: [
      color(),
      size(),
      radius(),
      range("length", "length", 4, 3, 8, 1, G_CONTENT),
      text("value", "value", "12"),
    ],
    seed: { length: 4 },
  },
  autocomplete: {
    group: "HeroUI · Inputs",
    label: "Autocomplete",
    description: "Input with a filtered dropdown of options",
    specs: [
      variant(["flat", "faded", "bordered", "underlined"], "flat"),
      color(),
      size(),
      radius(),
      select("labelPlacement", "label placement", ["inside", "outside", "outside-left"], "inside"),
      text("label", "label", "Country"),
      text("placeholder", "placeholder", "Search…"),
      text("items", "items (comma)", "Germany,Spain,France,Italy"),
    ],
    seed: { label: "Country", items: "Germany,Spain,France,Italy" },
  },

  // ── Feedback & overlays (rendered in their open / visible state) ──────
  alert: {
    group: "HeroUI · Feedback",
    label: "Alert",
    description: "Inline alert with title, description and icon",
    specs: [
      variant(["solid", "flat", "faded", "bordered"], "flat"),
      color(G_STYLE, "primary"),
      radius(),
      text("title", "title", "Heads up!"),
      text("description", "description", "This is an alert message."),
      toggle("isClosable", "closable"),
      toggle("hideIcon", "hide icon"),
    ],
    seed: { title: "Heads up!", description: "This is an alert message." },
  },
  tooltip: {
    group: "HeroUI · Feedback",
    label: "Tooltip",
    description: "Hover hint (shown attached to a trigger)",
    specs: [
      color(),
      size(),
      radius(),
      select("placement", "placement", ["top", "bottom", "left", "right"], "top"),
      text("content", "content", "I am a tooltip"),
      text("label", "trigger", "Hover me"),
      toggle("showArrow", "arrow", true),
    ],
    seed: { content: "I am a tooltip", label: "Hover me" },
  },
  popover: {
    group: "HeroUI · Feedback",
    label: "Popover",
    description: "Floating panel anchored to a trigger",
    specs: [
      color(),
      size(),
      radius(),
      select("placement", "placement", ["top", "bottom", "left", "right"], "bottom"),
      text("label", "trigger", "Open popover"),
      text("title", "title", "Popover title"),
      text("content", "content", "Popover content goes here."),
      toggle("showArrow", "arrow", true),
    ],
    seed: { label: "Open popover", title: "Popover title" },
  },
  modal: {
    group: "HeroUI · Feedback",
    label: "Modal",
    description: "Dialog (shown in its open state)",
    specs: [
      select("modalSize", "size", ["sm", "md", "lg", "xl", "2xl"], "md"),
      radius(),
      select("backdrop", "backdrop", ["opaque", "blur", "transparent"], "blur"),
      text("title", "title", "Modal title"),
      text("body", "body", "Modal body content."),
    ],
    seed: { title: "Modal title", body: "Modal body content." },
  },
  toast: {
    group: "HeroUI · Feedback",
    label: "Toast",
    description: "Transient notification card",
    specs: [
      color(G_STYLE, "default"),
      variant(["flat", "solid", "bordered"], "flat"),
      radius(),
      text("title", "title", "Saved"),
      text("description", "description", "Your changes were saved."),
    ],
    seed: { title: "Saved", description: "Your changes were saved." },
  },
  drawer: {
    group: "HeroUI · Feedback",
    label: "Drawer",
    description: "Side panel (shown in its open state)",
    specs: [
      select("placement", "placement", ["left", "right", "top", "bottom"], "right"),
      select("drawerSize", "size", ["sm", "md", "lg", "xl"], "md"),
      text("title", "title", "Drawer title"),
      text("body", "body", "Drawer body content."),
    ],
    seed: { title: "Drawer title", body: "Drawer body content." },
  },

  // ── Navigation ────────────────────────────────────────────────────────
  accordion: {
    group: "HeroUI · Navigation",
    label: "Accordion",
    description: "Collapsible sections",
    specs: [
      variant(["light", "shadow", "bordered", "splitted"], "light"),
      text("items", "titles (comma)", "Overview,Details,Pricing"),
      text("body", "panel text", "Section content goes here."),
      toggle("compact", "compact"),
    ],
    seed: { items: "Overview,Details,Pricing" },
  },
  tabs: {
    group: "HeroUI · Navigation",
    label: "Tabs",
    description: "Tabbed navigation",
    specs: [
      variant(["solid", "light", "underlined", "bordered"], "solid"),
      color(),
      size(),
      radius(),
      select("placement", "placement", ["top", "bottom", "start", "end"], "top"),
      text("items", "tabs (comma)", "Photos,Music,Videos"),
      toggle("fullWidth", "full width"),
    ],
    seed: { items: "Photos,Music,Videos" },
  },
  breadcrumbs: {
    group: "HeroUI · Navigation",
    label: "Breadcrumbs",
    description: "Hierarchical navigation trail",
    specs: [
      color(),
      size(),
      text("items", "items (comma)", "Home,Music,Artist,Album"),
      text("separator", "separator", "/"),
      select("underline", "underline", ["none", "hover", "always", "active"], "none"),
    ],
    seed: { items: "Home,Music,Artist,Album" },
  },
  pagination: {
    group: "HeroUI · Navigation",
    label: "Pagination",
    description: "Page navigation control",
    specs: [
      variant(["bordered", "light", "flat", "faded"], "flat"),
      color(G_STYLE, "primary"),
      size(),
      radius(),
      range("total", "total pages", 10, 1, 50, 1, G_CONTENT),
      range("page", "active page", 1, 1, 50, 1, G_CONTENT),
      toggle("showControls", "controls", true),
      toggle("isCompact", "compact"),
    ],
    seed: { total: 10, page: 1 },
  },
  navbar: {
    group: "HeroUI · Navigation",
    label: "Navbar",
    description: "Top navigation bar",
    specs: [
      text("brand", "brand", "ACME"),
      text("items", "items (comma)", "Features,Pricing,About"),
      toggle("isBordered", "bordered", true),
      toggle("showActions", "action buttons", true),
    ],
    seed: { brand: "ACME", items: "Features,Pricing,About" },
  },
  listbox: {
    group: "HeroUI · Navigation",
    label: "Listbox",
    description: "Selectable list of options",
    specs: [
      color(),
      variant(["solid", "bordered", "light", "flat", "faded", "shadow"], "flat"),
      text("items", "items (comma)", "New file,Copy link,Edit,Delete"),
      text("label", "title", "Actions"),
    ],
    seed: { items: "New file,Copy link,Edit,Delete" },
  },
  dropdown: {
    group: "HeroUI · Navigation",
    label: "Dropdown",
    description: "Menu opened from a trigger (shown open)",
    specs: [
      color(),
      variant(["solid", "bordered", "light", "flat", "faded", "shadow"], "flat"),
      text("label", "trigger", "Open menu"),
      text("items", "items (comma)", "Profile,Settings,Team,Log out"),
    ],
    seed: { label: "Open menu", items: "Profile,Settings,Team,Log out" },
  },
  scroll_shadow: {
    group: "HeroUI · Navigation",
    label: "Scroll Shadow",
    description: "Scrollable area with fade shadows",
    specs: [
      select("orientation", "orientation", ["vertical", "horizontal"], "vertical"),
      range("scrollHeight", "height", 160, 80, 400, 10, G_LAYOUT),
      text("body", "content", "Long scrollable content…"),
    ],
  },

  // ── Date & time (simplified static renders) ───────────────────────────
  calendar: {
    group: "HeroUI · Date",
    label: "Calendar",
    description: "Month calendar grid",
    specs: [
      color(G_STYLE, "primary"),
      text("month", "month label", "August 2024"),
      range("selectedDay", "selected day", 7, 1, 28, 1, G_CONTENT),
    ],
    seed: { month: "August 2024", selectedDay: 7 },
  },
  date_input: {
    group: "HeroUI · Date",
    label: "Date Input",
    description: "Segmented date field",
    specs: [
      variant(["flat", "faded", "bordered", "underlined"], "flat"),
      color(),
      size(),
      radius(),
      text("label", "label", "Birth date"),
      text("value", "value", "2024 / 08 / 07"),
    ],
    seed: { label: "Birth date", value: "2024 / 08 / 07" },
  },
};

/** Names of every HeroUI component type (for the IR enum + workshop). */
export const HERO_TYPES = Object.keys(HERO_COMPONENTS);

export function isHeroType(type: string): boolean {
  return type in HERO_COMPONENTS;
}
