import { describe, expect, it } from "vitest";
import {
  findExternalFontRequests,
  findSecretLeaks,
  fontProblems,
  iconProblems,
  missingPwaFiles,
  shellProblems,
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

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const icons = [
  { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
  { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  {
    src: "icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];
const manifestOf = (list: unknown[]) => JSON.stringify({ icons: list });
const dist = () =>
  new Map<string, Buffer>([
    ["icon-192.png", png(192, 192)],
    ["icon-512.png", png(512, 512)],
    ["icon-maskable-512.png", png(512, 512)],
  ]);

describe("iconProblems", () => {
  it("passes a manifest with all three icons, present and the stated size", () => {
    expect(iconProblems(manifestOf(icons), dist())).toEqual([]);
  });

  it.each([
    ["192 px", "icon-192.png", "No 192x192 PNG icon in the manifest"],
    ["512 px", "icon-512.png", "No 512x512 PNG icon in the manifest"],
    [
      "maskable",
      "icon-maskable-512.png",
      "No maskable PNG icon in the manifest",
    ],
  ])("fails when the %s icon is not listed", (_n, src, message) => {
    const rest = icons.filter((i) => i.src !== src);
    expect(iconProblems(manifestOf(rest), dist())).toEqual([message]);
  });

  it("fails when a listed icon file is missing from dist", () => {
    const files = dist();
    files.delete("icon-192.png");
    expect(iconProblems(manifestOf(icons), files)).toEqual([
      "Icon file missing from dist: icon-192.png",
    ]);
  });

  it("fails when an icon is not its stated pixel size", () => {
    const files = dist();
    files.set("icon-512.png", png(256, 256));
    expect(iconProblems(manifestOf(icons), files)).toEqual([
      "Icon icon-512.png is 256x256, manifest says 512x512",
    ]);
  });

  it("accepts a leading slash in src", () => {
    const slashed = icons.map((i) => ({ ...i, src: `/${i.src}` }));
    expect(iconProblems(manifestOf(slashed), dist())).toEqual([]);
  });

  it("fails on a manifest with no icons", () => {
    expect(iconProblems("{}", dist())).toHaveLength(3);
  });
});

describe("shellProblems", () => {
  const sw =
    '{url:"index.html",revision:"a"},{url:"assets/index-1.js",revision:null},{url:"assets/index-1.css",revision:null}' +
    ',new NavigationRoute(e.createHandlerBoundToURL("index.html"),{denylist:[/^\\/api\\//]})';
  const paths = ["index.html", "assets/index-1.js", "assets/index-1.css"];

  it("passes when the shell is precached and navigation falls back to it", () => {
    expect(shellProblems(paths, sw)).toEqual([]);
  });

  it("reports a shell file that is not precached", () => {
    expect(shellProblems(paths, sw.replace("assets/index-1.css", "x"))).toEqual(
      ["Not precached, so a cold start offline fails: assets/index-1.css"],
    );
  });

  it("reports a missing navigation fallback", () => {
    expect(
      shellProblems(paths, sw.replace("NavigationRoute", "Other")),
    ).toEqual(["No navigation fallback to index.html in sw.js"]);
  });

  it("reports a service worker that lets /api/ fall back to the shell", () => {
    expect(shellProblems(paths, sw.replace("denylist", "other"))).toEqual([
      "sw.js does not keep /api/ out of the navigation fallback",
    ]);
  });
});
