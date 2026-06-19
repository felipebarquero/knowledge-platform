// Allow side-effect CSS imports (e.g. React Flow's stylesheet) in typed TSX.
declare module "*.css";

// Iconify offline collections (lazy-imported for the icon picker + render).
declare module "@iconify-json/*/icons.json" {
  const data: { prefix: string; icons: Record<string, unknown> };
  export default data;
}
