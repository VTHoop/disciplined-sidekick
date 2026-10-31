/** Rounds to one decimal place, e.g. 1.24 gives 1.2 and 1.26 gives 1.3. */
export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
