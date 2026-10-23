import type { AuthClient } from "./auth/auth-client";
import { AuthProvider } from "./auth/auth-context";
import { AppRoutes } from "./auth/routes";

/** Needs a Router above it (BrowserRouter in the app, MemoryRouter in tests). */
export function App({ auth }: { auth: AuthClient }) {
  return (
    <AuthProvider auth={auth}>
      <AppRoutes />
    </AuthProvider>
  );
}
