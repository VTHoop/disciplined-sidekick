import type { AuthClient } from "./auth/auth-client";
import { AuthProvider } from "./auth/auth-context";
import { AppRoutes } from "./auth/routes";
import type { TargetsStore } from "./settings/targets-store";

/** Needs a Router above it (BrowserRouter in the app, MemoryRouter in tests). */
export function App({
  auth,
  targets,
}: {
  auth: AuthClient;
  targets: TargetsStore;
}) {
  return (
    <AuthProvider auth={auth}>
      <AppRoutes targets={targets} />
    </AuthProvider>
  );
}
