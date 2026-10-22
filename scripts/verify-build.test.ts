import { describe, expect, it } from "vitest";
import { findSecretLeaks, missingPwaFiles } from "./verify-build";

const secrets = {
  ANTHROPIC_API_KEY: "sk-ant-sentinel-123456",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-sentinel-abcdef",
};

describe("findSecretLeaks", () => {
  it("reports a file containing a configured secret value", () => {
    const leaks = findSecretLeaks(
      [{ path: "assets/index.js", content: 'fetch("x",{k:"sk-ant-sentinel-123456"})' }],
      secrets,
    );
    expect(leaks).toEqual([
      { path: "assets/index.js", secret: "ANTHROPIC_API_KEY" },
    ]);
  });

  it("reports a Supabase service-role JWT even when its value is unknown", () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString(
      "base64url",
    );
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    const leaks = findSecretLeaks([{ path: "a.js", content: jwt }], {});
    expect(leaks).toHaveLength(1);
  });

  it("passes a bundle that only holds the publishable key", () => {
    const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString(
      "base64url",
    );
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    expect(findSecretLeaks([{ path: "a.js", content: jwt }], secrets)).toEqual([]);
  });

  it("ignores empty secret values", () => {
    expect(
      findSecretLeaks([{ path: "a.js", content: "anything" }], { X: "" }),
    ).toEqual([]);
  });
});

describe("missingPwaFiles", () => {
  it("lists the manifest and service worker when absent", () => {
    expect(missingPwaFiles(["index.html"])).toEqual([
      "manifest.webmanifest",
      "sw.js",
    ]);
  });

  it("returns nothing when both are present", () => {
    expect(
      missingPwaFiles(["index.html", "manifest.webmanifest", "sw.js"]),
    ).toEqual([]);
  });
});
