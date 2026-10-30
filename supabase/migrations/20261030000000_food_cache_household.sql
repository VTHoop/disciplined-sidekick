-- A branded cache row also keeps the label's household serving (1 cup), which
-- serving_size_g weighs, so a spoken "1 cup" converts to label grams. Additive:
-- code from before this change neither reads nor writes the columns.
alter table public.food_cache add column household_amount double precision;
alter table public.food_cache add column household_unit text;

alter table public.food_cache
  add constraint food_cache_household_check check (
    (household_amount is null) = (household_unit is null)
    and (household_amount is null or household_amount > 0)
  );
