import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Active (uncommented) lines of one `[section]` of config.toml. */
function section(toml: string, name: string): string[] | undefined {
  const lines = toml.split("\n").map((l) => l.trim());
  const start = lines.indexOf(`[${name}]`);
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("["));
  return (end === -1 ? rest : rest.slice(0, end)).filter(
    (l) => l && !l.startsWith("#"),
  );
}

const config = read("supabase/config.toml");

describe("supabase auth config", () => {
  it("disables signups", () => {
    expect(section(config, "auth")).toContain("enable_signup = false");
    expect(section(config, "auth.email")).toContain("enable_signup = false");
  });

  it("uses a 6-digit email OTP", () => {
    expect(section(config, "auth.email")).toContain("otp_length = 6");
  });

  it("has no session timebox or inactivity timeout", () => {
    const sessions = section(config, "auth.sessions") ?? [];
    expect(sessions.join("\n")).not.toMatch(/timebox|inactivity_timeout/);
  });
});

describe("OTP email template", () => {
  const magicLink = section(config, "auth.email.template.magic_link") ?? [];
  const path = magicLink
    .find((l) => l.startsWith("content_path"))
    ?.match(/"\.?\/?(.+)"/)?.[1];

  it("replaces the magic-link template, which Supabase uses for OTP sign-in", () => {
    expect(path).toBeDefined();
    expect(existsSync(join(root, path ?? "missing"))).toBe(true);
  });

  it("shows the code and no sign-in link", () => {
    const html = read(path ?? "missing");
    expect(html).toContain("{{ .Token }}");
    expect(html).not.toMatch(/ConfirmationURL|TokenHash|SiteURL|<a\s|href=/i);
  });
});

describe("focus styles", () => {
  it("keeps a visible keyboard focus indicator", () => {
    const css = read("apps/web/src/styles/base.css");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*(?!none)/);
  });
});
