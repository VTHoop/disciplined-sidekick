import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pngSize } from "./png.ts";

export interface BuiltFile {
  path: string;
  content: string;
}

export interface Leak {
  path: string;
  secret: string;
}

const SECRET_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "API_DATA_GOV_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const PATTERNS: Record<string, RegExp> = {
  "anthropic-key-pattern": /sk-ant-[A-Za-z0-9_-]{20,}/,
  "supabase-secret-key-pattern": /sb_secret_[A-Za-z0-9_-]{10,}/,
};

function hasServiceRoleJwt(content: string): boolean {
  for (const [, payload] of content.matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]*/g)) {
    try {
      const claims = JSON.parse(
        Buffer.from(payload as string, "base64url").toString("utf8"),
      );
      if (claims.role === "service_role") return true;
    } catch {
      // not a JWT payload
    }
  }
  return false;
}

/** Finds server-only secrets (by configured value or by shape) in built client files. */
export function findSecretLeaks(
  files: BuiltFile[],
  secrets: Record<string, string>,
): Leak[] {
  const leaks: Leak[] = [];
  for (const { path, content } of files) {
    for (const [name, value] of Object.entries(secrets)) {
      if (value && content.includes(value)) leaks.push({ path, secret: name });
    }
    for (const [name, pattern] of Object.entries(PATTERNS)) {
      if (pattern.test(content)) leaks.push({ path, secret: name });
    }
    if (hasServiceRoleJwt(content)) {
      leaks.push({ path, secret: "supabase-service-role-jwt" });
    }
  }
  return leaks;
}

export function missingPwaFiles(paths: string[]): string[] {
  return ["manifest.webmanifest", "sw.js"].filter((f) => !paths.includes(f));
}

interface ManifestIcon {
  src?: string;
  sizes?: string;
  type?: string;
  purpose?: string;
}

/**
 * Android's install criteria need a 192 and a 512 PNG, and the maskable icon
 * keeps the mask from cropping the artwork. Every listed PNG must be in dist at
 * the size the manifest states. `files` maps a dist path to its bytes.
 */
export function iconProblems(
  manifestJson: string,
  files: Map<string, Buffer>,
): string[] {
  const manifest = JSON.parse(manifestJson) as { icons?: ManifestIcon[] };
  const pngs = (manifest.icons ?? []).filter((i) => i.type === "image/png");
  const purposes = (i: ManifestIcon) => (i.purpose ?? "any").split(/\s+/);
  const problems: string[] = [];
  for (const size of [192, 512]) {
    const stated = `${size}x${size}`;
    if (!pngs.some((i) => i.sizes === stated && purposes(i).includes("any")))
      problems.push(`No ${stated} PNG icon in the manifest`);
  }
  if (!pngs.some((i) => purposes(i).includes("maskable")))
    problems.push("No maskable PNG icon in the manifest");

  for (const icon of pngs) {
    const path = (icon.src ?? "").replace(/^\/+/, "");
    const bytes = files.get(path);
    if (!bytes) {
      problems.push(`Icon file missing from dist: ${path}`);
      continue;
    }
    const size = pngSize(bytes);
    const actual = size ? `${size.width}x${size.height}` : "not a PNG";
    if (actual !== icon.sizes)
      problems.push(`Icon ${path} is ${actual}, manifest says ${icon.sizes}`);
  }
  return problems;
}

/**
 * A cold start with no network needs the shell in the service worker's precache:
 * the page, its scripts and styles, and a navigation fallback to the page that
 * leaves /api/ alone.
 */
export function shellProblems(paths: string[], swSource: string): string[] {
  const shell = paths.filter(
    (p) =>
      p === "index.html" || (p.startsWith("assets/") && /\.(js|css)$/.test(p)),
  );
  const problems = shell
    .filter((p) => !swSource.includes(p))
    .map((p) => `Not precached, so a cold start offline fails: ${p}`);
  if (!swSource.includes("NavigationRoute"))
    problems.push("No navigation fallback to index.html in sw.js");
  else if (!swSource.includes("denylist"))
    problems.push("sw.js does not keep /api/ out of the navigation fallback");
  return problems;
}

const EXPECTED_FONT_COUNT = 6;

/** Fonts must be built into dist (three weights per family) and precached by the service worker. */
export function fontProblems(paths: string[], swSource: string): string[] {
  const fonts = paths.filter((p) => p.endsWith(".woff2"));
  const problems: string[] = [];
  if (fonts.length !== EXPECTED_FONT_COUNT) {
    problems.push(
      `Expected ${EXPECTED_FONT_COUNT} woff2 fonts in dist, found ${fonts.length}`,
    );
  }
  for (const font of fonts) {
    if (!swSource.includes(font)) problems.push(`Font not precached: ${font}`);
  }
  return problems;
}

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

/** Built files that point at a remote font host. */
export function findExternalFontRequests(
  files: BuiltFile[],
): { path: string; host: string }[] {
  return files.flatMap(({ path, content }) =>
    FONT_HOSTS.filter((host) => content.includes(host)).map((host) => ({
      path,
      host,
    })),
  );
}

if (import.meta.main) {
  const dist = join(import.meta.dirname, "..", "apps/web/dist");
  const paths = readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dist, join(e.parentPath, e.name)));
  const files = paths
    .filter((path) => !/\.(woff2|png)$/.test(path))
    .map((path) => ({
      path,
      content: readFileSync(join(dist, path), "utf8"),
    }));
  const secrets = Object.fromEntries(
    SECRET_ENV_VARS.map((name) => [name, process.env[name] ?? ""]),
  );

  const missing = missingPwaFiles(paths);
  const leaks = findSecretLeaks(files, secrets);
  const sw = files.find((f) => f.path === "sw.js")?.content ?? "";
  const fontIssues = fontProblems(paths, sw);
  const external = findExternalFontRequests(files);
  const manifest = files.find((f) => f.path === "manifest.webmanifest");
  const binary = new Map(
    paths
      .filter((p) => p.endsWith(".png"))
      .map((p) => [p, readFileSync(join(dist, p))] as const),
  );
  const iconIssues = manifest ? iconProblems(manifest.content, binary) : [];
  const shellIssues = shellProblems(paths, sw);
  for (const f of missing) console.error(`Missing PWA file in dist: ${f}`);
  for (const issue of fontIssues) console.error(issue);
  for (const issue of [...iconIssues, ...shellIssues]) console.error(issue);
  for (const e of external)
    console.error(`Remote font host ${e.host} in ${e.path}`);
  for (const l of leaks)
    console.error(`Secret leaked: ${l.secret} in ${l.path}`);
  if (
    missing.length ||
    leaks.length ||
    fontIssues.length ||
    external.length ||
    iconIssues.length ||
    shellIssues.length
  )
    process.exit(1);
  console.log(
    `Build verified: ${paths.length} files, PWA files, icons and app shell present, fonts precached, no secrets.`,
  );
}
