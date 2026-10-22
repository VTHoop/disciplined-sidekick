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

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

if (import.meta.main) {
  const dist = join(import.meta.dirname, "..", "apps/web/dist");
  const paths = listFiles(dist).map((p) => relative(dist, p));
  const files = paths.map((path) => ({
    path,
    content: readFileSync(join(dist, path), "utf8"),
  }));
  const secrets = Object.fromEntries(
    SECRET_ENV_VARS.map((name) => [name, process.env[name] ?? ""]),
  );

  const missing = missingPwaFiles(paths);
  const leaks = findSecretLeaks(files, secrets);
  for (const f of missing) console.error(`Missing PWA file in dist: ${f}`);
  for (const l of leaks)
    console.error(`Secret leaked: ${l.secret} in ${l.path}`);
  if (missing.length || leaks.length) process.exit(1);
  console.log(
    `Build verified: ${paths.length} files, PWA files present, no secrets.`,
  );
}
