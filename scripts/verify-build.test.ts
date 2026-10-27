import { describe, expect, it } from "vitest";
import {
  findExternalFontRequests,
  findSecretLeaks,
  fontProblems,
  missingPwaFiles,
} from "./verify-build";

const secrets = {
  ANTHROPIC_API_KEY: "sk-ant-sentinel-123456",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-sentinel-abcdef",
};

describe("findSecretLeaks", () => {
  it("reports a file containing a configured secret value", () => {
    const leaks = findSecretLeaks(
      [
        {
          path: "assets/index.js",
          content: 'fetch("x",{k:"sk-ant-sentinel-123456"})',
        },
      ],
      secrets,
    );
    expect(leaks).toEqual([
      { path: "assets/index.js", secret: "ANTHROPIC_API_KEY" },
    ]);
  });

  it("reports a Supabase service-role JWT even when its value is unknown", () => {
    const payload = Buffer.from(
      JSON.stringify({ role: "service_role" }),
    ).toString("base64url");
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    const leaks = findSecretLeaks([{ path: "a.js", content: jwt }], {});
    expect(leaks).toHaveLength(1);
  });

  it("reports an Anthropic-shaped key even when its value is unknown", () => {
    const leaks = findSecretLeaks(
      [{ path: "a.js", content: "k=sk-ant-api03-abcdefghijklmnopqrstuv" }],
      {},
    );
    expect(leaks).toEqual([{ path: "a.js", secret: "anthropic-key-pattern" }]);
  });

  it("reports a Supabase secret-key-shaped value even when unknown", () => {
    const leaks = findSecretLeaks(
      [{ path: "a.js", content: "k=sb_secret_abcdefghijklmnop" }],
      {},
    );
    expect(leaks).toEqual([
      { path: "a.js", secret: "supabase-secret-key-pattern" },
    ]);
  });

  it("passes a bundle that only holds the publishable key", () => {
    const payload = Buffer.from(JSON.stringify({ role: "anon" })).toString(
      "base64url",
    );
    const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    expect(findSecretLeaks([{ path: "a.js", content: jwt }], secrets)).toEqual(
      [],
    );
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

describe("fontProblems", () => {
  const fonts = Array.from(
    { length: 6 },
    (_, i) => `assets/font-${i}-latin-400-normal-abc.woff2`,
  );
  const sw = fonts.map((f) => `{url:"${f}",revision:null}`).join(",");

  it("passes when six woff2 fonts are built and all are precached", () => {
    expect(fontProblems(["index.html", ...fonts], sw)).toEqual([]);
  });

  it("reports a font count other than six", () => {
    expect(fontProblems(fonts.slice(1), sw)).toEqual([
      "Expected 6 woff2 fonts in dist, found 5",
    ]);
  });

  it("reports a font missing from the service worker precache", () => {
    const partial = sw.replace(fonts[2] as string, "assets/other.js");
    expect(fontProblems(fonts, partial)).toEqual([
      `Font not precached: ${fonts[2]}`,
    ]);
  });
});

describe("findExternalFontRequests", () => {
  it("reports Google Fonts hosts in built files", () => {
    const files = [
      {
        path: "index.html",
        content: '<link href="https://fonts.googleapis.com/css2?family=X">',
      },
      {
        path: "assets/a.css",
        content: "src:url(https://fonts.gstatic.com/x.woff2)",
      },
      { path: "assets/b.js", content: 'fetch("/api/health")' },
    ];
    expect(findExternalFontRequests(files)).toEqual([
      { path: "index.html", host: "fonts.googleapis.com" },
      { path: "assets/a.css", host: "fonts.gstatic.com" },
    ]);
  });

  it("passes a bundle that loads fonts from itself", () => {
    expect(
      findExternalFontRequests([
        { path: "assets/a.css", content: "src:url(/assets/x.woff2)" },
      ]),
    ).toEqual([]);
  });
});
