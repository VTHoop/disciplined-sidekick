export interface BrandFields {
  brandOwner?: string | undefined;
  brandName?: string | undefined;
}

/** Lower case with every space and punctuation mark removed. */
const squash = (name: string) =>
  name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Whether a Branded result is from the named brand: its brand owner or brand
 * name contains the named brand, or is contained by it, ignoring case and
 * punctuation. A blank field never matches.
 */
export function brandMatches(named: string, candidate: BrandFields): boolean {
  const wanted = squash(named);
  if (!wanted) return false;
  return [candidate.brandOwner, candidate.brandName].some((field) => {
    const have = squash(field ?? "");
    return have !== "" && (have.includes(wanted) || wanted.includes(have));
  });
}
