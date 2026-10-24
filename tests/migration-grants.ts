/**
 * Public tables created by the given migrations that never get an explicit
 * grant to service_role. Hosted Supabase does not grant it by default (local
 * does), so a missing grant only fails after deploy. A table the server never
 * touches opts out with a comment: `-- service_role: none public.<table>`.
 * Takes raw SQL (comments included).
 */
export function tablesMissingServiceRoleGrant(migrations: string[]): string[] {
  const optedOut = new Set<string>();
  const code = migrations
    .map((sql) => {
      for (const m of sql.matchAll(
        /--\s*service_role:\s*none\s+public\.(\w+)/gi,
      )) {
        optedOut.add(String(m[1]).toLowerCase());
      }
      return sql.replace(/--[^\n]*/g, "").replace(/'[^']*'/g, "''");
    })
    .join("\n");

  const created = [
    ...code.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi,
    ),
  ].map((m) => String(m[1]).toLowerCase());

  return created.filter(
    (table) =>
      !optedOut.has(table) &&
      !new RegExp(
        `grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+[^;]*\\bservice_role\\b`,
        "i",
      ).test(code),
  );
}
