import { Navigate, Outlet, Route, Routes } from "react-router";
import type { FoodApi } from "../food/food-api";
import { SettingsScreen } from "../settings/settings";
import type { TargetsStore } from "../settings/targets-store";
import { useAuth } from "./auth-context";
import { SignInScreen } from "./sign-in";
import { TodayScreen } from "./today";

function Loading() {
  return <p role="status">Loading…</p>;
}

/** App screens: signed-out visitors are sent to sign-in. */
function RequireAuth() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  return status === "signedIn" ? (
    <Outlet />
  ) : (
    <Navigate to="/sign-in" replace />
  );
}

/** Sign-in: signed-in users are sent to Today. */
function PublicOnly() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  return status === "signedOut" ? <Outlet /> : <Navigate to="/" replace />;
}

export function AppRoutes({
  targets,
  food,
}: {
  targets: TargetsStore;
  food: FoodApi;
}) {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route index element={<TodayScreen food={food} />} />
        <Route
          path="/settings"
          element={<SettingsScreen targets={targets} />}
        />
      </Route>
      <Route element={<PublicOnly />}>
        <Route path="/sign-in" element={<SignInScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
