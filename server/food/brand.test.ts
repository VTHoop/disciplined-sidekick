import { describe, expect, it } from "vitest";
import { brandMatches } from "./brand";

describe("brandMatches", () => {
  it("matches the brand name", () => {
    expect(brandMatches("Chobani", { brandName: "Chobani" })).toBe(true);
  });

  it("matches when the brand owner contains the named brand", () => {
    expect(
      brandMatches("Chobani", {
        brandOwner: "Chobani Global Holdings",
        brandName: "",
      }),
    ).toBe(true);
  });

  it("matches when the named brand contains the candidate's name", () => {
    expect(brandMatches("Chobani Greek Yogurt", { brandName: "Chobani" })).toBe(
      true,
    );
  });

  it("ignores case and punctuation", () => {
    expect(brandMatches("PURA  VIDA", { brandName: "Pura-Vida" })).toBe(true);
    expect(brandMatches("Ben & Jerry's", { brandOwner: "BEN & JERRYS" })).toBe(
      true,
    );
  });

  it("does not treat an empty brand owner or brand name as a match", () => {
    expect(brandMatches("Chobani", { brandOwner: "", brandName: "" })).toBe(
      false,
    );
    expect(brandMatches("Chobani", {})).toBe(false);
  });

  it("rejects a store brand or any other brand", () => {
    expect(
      brandMatches("Chobani", {
        brandOwner: "Kroger",
        brandName: "Simple Truth",
      }),
    ).toBe(false);
    expect(brandMatches("Chobani", { brandName: "Fage" })).toBe(false);
  });
});
