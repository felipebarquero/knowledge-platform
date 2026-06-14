import { describe, expect, it } from "vitest";
import { entranceParams, parseDuration } from "../src/animation";

describe("parseDuration", () => {
  it("parses millisecond strings", () => {
    expect(parseDuration("400ms", 0)).toBe(400);
  });

  it("parses second strings", () => {
    expect(parseDuration("0.5s", 0)).toBe(500);
  });

  it("parses bare numbers as milliseconds", () => {
    expect(parseDuration("250", 0)).toBe(250);
  });

  it("falls back on missing or malformed input", () => {
    expect(parseDuration(undefined, 300)).toBe(300);
    expect(parseDuration("fast-ish", 300)).toBe(300);
  });
});

describe("entranceParams", () => {
  it("maps declarative entrances to animatable properties", () => {
    expect(entranceParams("fade")).toEqual({ opacity: [0, 1] });
    expect(entranceParams("slide-up")).toHaveProperty("translateY");
    expect(entranceParams("rise")).toHaveProperty("translateY");
    expect(entranceParams("scale-in")).toHaveProperty("scale");
  });

  it("returns null for none/unknown entrances", () => {
    expect(entranceParams("none")).toBeNull();
    expect(entranceParams(undefined)).toBeNull();
    expect(entranceParams("teleport")).toBeNull();
  });
});
