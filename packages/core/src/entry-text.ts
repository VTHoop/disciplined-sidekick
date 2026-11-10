/** Trims each line of a food entry and drops blank ones; the line breaks that remain separate the foods. */
export function cleanLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
