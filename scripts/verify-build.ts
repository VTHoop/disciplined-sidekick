import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

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
    .filter((path) => !path.endsWith(".woff2"))
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
  for (const f of missing) console.error(`Missing PWA file in dist: ${f}`);
  for (const issue of fontIssues) console.error(issue);
  for (const e of external)
    console.error(`Remote font host ${e.host} in ${e.path}`);
  for (const l of leaks)
    console.error(`Secret leaked: ${l.secret} in ${l.path}`);
  if (missing.length || leaks.length || fontIssues.length || external.length)
    process.exit(1);
  console.log(
    `Build verified: ${paths.length} files, PWA files present, fonts precached, no secrets.`,
  );
}
