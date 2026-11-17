import { parseArgs } from "node:util";

export const DEFAULT_REPEATS = 3;

export type EvalArgs =
  | { ok: true; repeats: number; ids: string[]; categories: string[] }
  | { ok: false; message: string };

const list = (values: string[] | undefined) =>
  (values ?? [])
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);

/** `pnpm eval [--repeats n] [--case id[,id]] [--category name[,name]]` */
export function parseEvalArgs(argv: string[]): EvalArgs {
  let values: { repeats?: string; case?: string[]; category?: string[] };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        repeats: { type: "string" },
        case: { type: "string", multiple: true },
        category: { type: "string", multiple: true },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const repeats =
    values.repeats === undefined ? DEFAULT_REPEATS : Number(values.repeats);
  if (!Number.isInteger(repeats) || repeats < 1) {
    return {
      ok: false,
      message: `--repeats must be a whole number of 1 or more, not "${values.repeats}"`,
    };
  }
  return {
    ok: true,
    repeats,
    ids: list(values.case),
    categories: list(values.category),
  };
}
