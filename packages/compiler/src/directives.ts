/**
 * The authoring spec allows the spaced shorthand `::plot sprint_distribution`.
 * remark-directive's native leaf form is `::plot[sprint_distribution]`, so we
 * normalize the shorthand before parsing. Both forms are accepted.
 *
 * Known limitation (Phase 1): the rewrite is textual and also touches lines
 * inside fenced code blocks — harmless today because code blocks are dropped
 * from the IR with a warning, but revisit if a `code` node enters the taxonomy.
 */
const SHORTHAND_DIRECTIVE = /^([ \t]*)::([A-Za-z][\w-]*)[ \t]+(\S[^\n]*?)[ \t]*$/gm;

export function normalizeDirectiveShorthand(source: string): string {
  return source.replace(SHORTHAND_DIRECTIVE, (match, indent: string, name: string, arg: string) => {
    if (arg.startsWith("[") || arg.startsWith("{")) return match;
    return `${indent}::${name}[${arg.trim()}]`;
  });
}
