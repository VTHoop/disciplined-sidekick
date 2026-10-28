import type { AuthClient } from "./auth/auth-client";
import { AuthProvider } from "./auth/auth-context";
import { AppRoutes } from "./auth/routes";
import type { FoodApi } from "./food/food-api";
import type { TargetsStore } from "./settings/targets-store";

/** Needs a Router above it (BrowserRouter in the app, MemoryRouter in tests). */
export function App({
  auth,
  targets,
  food,
}: {
  auth: AuthClient;
  targets: TargetsStore;
  food: FoodApi;
}) {
  return (
    <AuthProvider auth={auth}>
      <AppRoutes targets={targets} food={food} />
    </AuthProvider>
  );
}
