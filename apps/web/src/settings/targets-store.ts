import type { StoredTargets, TargetField } from "@disciplined-sidekick/core";

export interface TargetsRow {
  calories_kcal: number | null;
  protein_g: number | null;
  fruit_veg_g: number | null;
  fruit_veg_edited: boolean;
}

type DbError = { message: string } | null;

/** The slice of the supabase-js client the store uses, so it can be tested without a network. */
export interface TargetsDb {
  from(table: "user_targets"): {
    select(columns: string): {
      maybeSingle(): PromiseLike<{ data: TargetsRow | null; error: DbError }>;
    };
    upsert(values: Partial<TargetsRow>): PromiseLike<{ error: DbError }>;
  };
}

export interface TargetsStore {
  /** The signed-in user's stored targets, or null if they never saved any. */
  load(): Promise<StoredTargets | null>;
  /** Saves one field (null clears it). Rejects if the save fails. */
  save(field: TargetField, value: number | null): Promise<void>;
}

const COLUMNS = "calories_kcal, protein_g, fruit_veg_g, fruit_veg_edited";

const patchFor = (
  field: TargetField,
  value: number | null,
): Partial<TargetsRow> => {
  switch (field) {
    case "calories":
      return { calories_kcal: value };
    case "protein":
      return { protein_g: value };
    case "fruitVeg":
      // Even a cleared value counts as an edit: it must not revert to the default.
      return { fruit_veg_g: value, fruit_veg_edited: true };
  }
};

/** Row level security scopes both calls to the signed-in user; user_id defaults to auth.uid(). */
export function createSupabaseTargetsStore(db: TargetsDb): TargetsStore {
  return {
    async load() {
      const { data, error } = await db
        .from("user_targets")
        .select(COLUMNS)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        calories: data.calories_kcal,
        protein: data.protein_g,
        fruitVeg: data.fruit_veg_g,
        fruitVegEdited: data.fruit_veg_edited,
      };
    },
    async save(field, value) {
      const { error } = await db
        .from("user_targets")
        .upsert(patchFor(field, value));
      if (error) throw new Error(error.message);
    },
  };
}
