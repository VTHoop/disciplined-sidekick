# Food golden set

The answer key the food pipeline is re-tested against before a prompt or model change ships. See the AI Evals decision record in Linear for the graders and tolerances.

**Privacy.** This repo is public. Cases come from the owner's real entries, and the owner reads each case before it's committed and rewords or drops anything that says more than the food: health context, people, or places that identify where the owner lives. A case holds only its id, category, input text, expected values (with where each answer came from) and tolerances, never a date, time, user id or entry id. `privacy.test.ts` enforces the fields and rejects dates and times in input text.

## Running it

```bash
pnpm eval
```

It needs `ANTHROPIC_API_KEY` and `API_DATA_GOV_KEY` in `.env` and makes real, paid calls. It is not part of `pnpm test` or CI. Flags:
- `--repeats n`: runs each case n times (default 3).
- `--case id[,id]`: runs only the named cases.
- `--category name[,name]`: runs only the named categories.

Each run starts with an empty cache for every repeat and keeps its `ai_runs` rows in memory, so nothing is written to the hosted `food_cache` or `ai_runs`. The console shows each case's passes per check and a summary. The full results go to `evals/results/<timestamp>.json`, which is gitignored.

## Adding a case

Add it to [`cases.ts`](cases.ts). Its id is permanent: runs are compared case by case on it.
- Items are matched to the pipeline's output by `canonicalName`, exactly, so write it the way `parseFood` should produce it.
- A `usda` or `branded` item lists every `fdcIds` value you'd accept. An `estimated` item gives a `kcalPer100g` and `proteinPer100g` range.
- `answerSource` says where each answer came from: `package-label`, `chain-nutrition`, `usda-entry` or `judgment`.
- A no-food case has `items: []`.
- A dish named without its contents ("Mezeh bowl") has `items: anySplit({ ... })`: any split into items passes, and only the totals are graded, plus whatever every item must be (`portionEstimated`, `brand`, `path`). Set kcal and protein from a typical version of the dish, and widen `kcalPct` and `proteinPct` so a light and a heavy version both pass. Canonical-name consistency isn't checked, since the split may differ each time. For a real test of the components, add the dish with its contents listed as a separate case.
- Leave anything you haven't checked as `UNCONFIRMED`. A case with any unconfirmed value still runs, but it isn't scored and is listed separately.

Default tolerances: grams ±10% when a quantity is given, ±40% when the portion is estimated, with a 5 g floor; entry kcal and protein ±15%, with floors of 10 kcal and 2 g. The wider of the percentage and the floor applies. A case's `tolerances` overrides any of them.
