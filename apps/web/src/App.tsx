import type { AuthClient } from "./auth/auth-client";
import { AuthProvider } from "./auth/auth-context";
import { AppRoutes } from "./auth/routes";
import type { FoodApi } from "./food/food-api";
import type { TargetsStore } from "./settings/targets-store";
import type { DayEntriesStore } from "./today/entries-store";
import type { UpdateController } from "./update/update-controller";

/** Needs a Router above it (BrowserRouter in the app, MemoryRouter in tests). */
export function App({
  auth,
  targets,
  food,
  entries,
  updates,
}: {
  auth: AuthClient;
  targets: TargetsStore;
  food: FoodApi;
  entries: DayEntriesStore;
  /** Absent in tests that do not exercise the update line. */
  updates?: UpdateController;
}) {
  return (
    <AuthProvider auth={auth}>
      <AppRoutes
        targets={targets}
        food={food}
        entries={entries}
        updates={updates}
      />
    </AuthProvider>
  );
}
