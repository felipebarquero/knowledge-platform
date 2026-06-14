import { describe, expect, it } from "vitest";
import { componentTypeSchema } from "@knowledge/ir";
import { HERO_COMPONENTS, HERO_TYPES, isHeroType } from "../src/hero/hero-specs";
import { specsFor } from "../src/option-specs";

describe("HeroUI catalog", () => {
  it("registers every HeroUI type in the IR component enum", () => {
    const enumValues = new Set<string>(componentTypeSchema.options);
    for (const type of HERO_TYPES) {
      expect(enumValues.has(type), `IR enum missing "${type}"`).toBe(true);
    }
  });

  it("does not duplicate native component types", () => {
    const native = ["card", "code", "table", "select", "slider", "switch"];
    for (const t of native) expect(HERO_TYPES.includes(t)).toBe(false);
  });

  it("exposes option-specs for every HeroUI type via specsFor", () => {
    for (const type of HERO_TYPES) {
      expect(specsFor(type).length, `${type} has no specs`).toBeGreaterThan(0);
    }
  });

  it("gives every spec a key, control kind and default", () => {
    for (const [name, meta] of Object.entries(HERO_COMPONENTS)) {
      for (const spec of meta.specs) {
        expect(spec.key, `${name} spec missing key`).toBeTruthy();
        expect(spec.control, `${name}.${spec.key} missing control`).toBeTruthy();
        expect(spec, `${name}.${spec.key} missing default`).toHaveProperty("default");
        if (spec.control === "select") {
          expect(spec.choices && spec.choices.length, `${name}.${spec.key} select needs choices`).toBeTruthy();
          expect(spec.choices).toContain(spec.default);
        }
      }
    }
  });

  it("classifies types correctly", () => {
    expect(isHeroType("button")).toBe(true);
    expect(isHeroType("histogram")).toBe(false);
  });
});
