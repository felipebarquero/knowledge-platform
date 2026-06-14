import { parse as parseYaml } from "yaml";
import type { ValidationIssue } from "@knowledge/ir";

/**
 * Raw (not yet schema-validated) registry definitions, as authored in YAML
 * sidecars or passed programmatically. Schema validation happens once, on the
 * assembled document, in @knowledge/ir — the compiler only parses and merges.
 */
export interface RawDefinitions {
  components?: Record<string, unknown>;
  datasets?: Record<string, unknown>;
  interactions?: Record<string, unknown>;
  bindings?: unknown[];
  sync?: unknown[];
  theme?: unknown;
  animations?: Record<string, unknown>;
}

export type DefinitionsInput = string | RawDefinitions | Array<string | RawDefinitions>;

const issueAt = (
  severity: "error" | "warning",
  code: string,
  path: string,
  message: string,
): ValidationIssue => ({ severity, code, path, message });

function mergeRecord(
  target: Record<string, unknown> | undefined,
  value: unknown,
): Record<string, unknown> {
  return { ...(target ?? {}), ...(value as Record<string, unknown>) };
}

/** Parse YAML sidecars (or accept pre-parsed objects) and merge registries; later parts win per key. */
export function resolveDefinitions(
  input: DefinitionsInput | undefined,
  issues: ValidationIssue[],
): RawDefinitions {
  const merged: RawDefinitions = {};
  if (input === undefined) return merged;

  const parts = Array.isArray(input) ? input : [input];
  parts.forEach((part, index) => {
    const path = `definitions[${index}]`;
    let value: unknown = part;

    if (typeof part === "string") {
      try {
        value = parseYaml(part);
      } catch (error) {
        issues.push(
          issueAt(
            "error",
            "YAML_PARSE",
            path,
            error instanceof Error ? error.message : "Invalid YAML",
          ),
        );
        return;
      }
    }

    if (value === null || value === undefined) return;
    if (typeof value !== "object" || Array.isArray(value)) {
      issues.push(
        issueAt(
          "error",
          "DEFINITIONS_SHAPE",
          path,
          "Definitions must be a mapping with registry keys (components, datasets, interactions, bindings, sync, theme, animations)",
        ),
      );
      return;
    }

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === null || entry === undefined) continue;
      switch (key) {
        case "components":
        case "datasets":
        case "interactions":
        case "animations":
          if (typeof entry !== "object" || Array.isArray(entry)) {
            issues.push(
              issueAt("error", "DEFINITIONS_SHAPE", `${path}.${key}`, `"${key}" must be a mapping`),
            );
            break;
          }
          merged[key] = mergeRecord(merged[key], entry);
          break;
        case "bindings":
        case "sync":
          if (!Array.isArray(entry)) {
            issues.push(
              issueAt("error", "DEFINITIONS_SHAPE", `${path}.${key}`, `"${key}" must be a list`),
            );
            break;
          }
          merged[key] = [...(merged[key] ?? []), ...entry];
          break;
        case "theme":
          merged.theme = entry;
          break;
        default:
          issues.push(
            issueAt(
              "warning",
              "UNKNOWN_DEFINITION_KEY",
              `${path}.${key}`,
              `Unknown definitions key "${key}" was ignored`,
            ),
          );
      }
    }
  });

  return merged;
}
