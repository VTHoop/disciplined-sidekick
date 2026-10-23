import { useAuth } from "./auth-context";

/** Placeholder; later tickets fill in the day. */
export function TodayScreen() {
  const { signOut } = useAuth();
  return (
    <main>
      <h1>Today</h1>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}
