import {
  DataError,
  type RecordFailure,
  report,
  toDataError,
} from "../client-errors";

/** One saved item as Today shows it. kcal, protein and fruitVegG are unrounded. */
export interface DayItem {
  /** Place in the entry; with the entry id it names the saved item. */
  position: number;
  name: string;
  canonicalName: string;
  grams: number;
  kcal: number;
  protein: number;
  fruitVegG: number;
  estimated: boolean;
  portionEstimated: boolean;
  brand: string | null;
}

/** The entries without one item, and without any entry that item leaves empty. */
export const withoutItem = (
  entries: DayEntry[],
  entryId: string,
  position: number,
): DayEntry[] =>
  entries
    .map((e) =>
      e.id === entryId
        ? { ...e, items: e.items.filter((i) => i.position !== position) }
        : e,
    )
    .filter((e) => e.items.length > 0);

/** One saved entry; `loggedAt` is an ISO timestamp. Items are in saved order. */
export interface DayEntry {
  id: string;
  text: string;
  loggedAt: string;
  items: DayItem[];
}

export interface DayEntriesStore {
  /** The entries saved for a local calendar day (YYYY-MM-DD), in any order. Rejects if the read fails. */
  load(localDate: string): Promise<DayEntry[]>;
  /** Deletes one saved item (an entry loses itself with its last item). Rejects if it fails. */
  deleteItem(entryId: string, position: number): Promise<void>;
}

interface ItemRow {
  position: number;
  name: string;
  canonical_name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  fruit_veg_g: number;
  estimated: boolean;
  portion_estimated: boolean;
  brand: string | null;
}

interface EntryRow {
  id: string;
  text: string;
  logged_at: string;
  food_items: ItemRow[];
}

/** The slice of the supabase-js client the store uses, so it can be tested without a network. */
export interface EntriesDb {
  from(table: "food_items"): {
    delete(): {
      eq(
        column: "entry_id",
        value: string,
      ): {
        eq(
          column: "position",
          value: number,
        ): {
          select(columns: "position"): PromiseLike<{
            data: { position: number }[] | null;
            error: { message: string; code?: string } | null;
            status?: number;
          }>;
        };
      };
    };
  };
  from(table: "food_entries"): {
    select(columns: string): {
      eq(
        column: "local_date",
        value: string,
      ): PromiseLike<{
        data: EntryRow[] | null;
        error: { message: string; code?: string } | null;
        status?: number;
      }>;
    };
  };
}

const COLUMNS =
  "id, text, logged_at, food_items(position, name, canonical_name, grams, kcal, protein_g, fruit_veg_g, estimated, portion_estimated, brand)";

/** Row level security scopes the read to the signed-in user. */
export function createSupabaseEntriesStore(
  db: EntriesDb,
  record: RecordFailure,
): DayEntriesStore {
  return {
    async load(localDate) {
      const { data, error, status } = await db
        .from("food_entries")
        .select(COLUMNS)
        .eq("local_date", localDate);
      if (error) {
        const failure = toDataError(error, status);
        report(record, "load_entries", failure);
        throw failure;
      }
      return (data ?? []).map((row) => ({
        id: row.id,
        text: row.text,
        loggedAt: row.logged_at,
        items: row.food_items
          .toSorted((a, b) => a.position - b.position)
          .map((i) => ({
            position: i.position,
            name: i.name,
            canonicalName: i.canonical_name,
            grams: i.grams,
            kcal: i.kcal,
            protein: i.protein_g,
            fruitVegG: i.fruit_veg_g,
            estimated: i.estimated,
            portionEstimated: i.portion_estimated,
            brand: i.brand,
          })),
      }));
    },
    async deleteItem(entryId, position) {
      const { data, error, status } = await db
        .from("food_items")
        .delete()
        .eq("entry_id", entryId)
        .eq("position", position)
        .select("position");
      // Row level security hides other users' rows without an error.
      const failure = error
        ? toDataError(error, status)
        : data?.length
          ? null
          : new DataError("The item was not deleted.", { status });
      if (failure) {
        report(record, "delete_item", failure);
        throw failure;
      }
    },
  };
}
