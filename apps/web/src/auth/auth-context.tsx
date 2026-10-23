import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AuthClient } from "./auth-client";

type Status = "loading" | "signedIn" | "signedOut";

interface AuthState {
  status: Status;
  auth: AuthClient;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const fromSession = (session: Session | null): Status =>
  session ? "signedIn" : "signedOut";

export function AuthProvider({
  auth,
  children,
}: {
  auth: AuthClient;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = auth.onAuthStateChange((_event, session) => {
      if (active) setStatus(fromSession(session));
    });
    auth
      .getSession()
      .then(
        ({ data }) => data.session,
        () => null,
      )
      .then((session) => {
        // An auth event that arrived first is newer than this lookup.
        if (active)
          setStatus((s) => (s === "loading" ? fromSession(session) : s));
      });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [auth]);

  const signOut = useCallback(async () => {
    const { error } = await auth.signOut();
    // Offline, the server call fails; still drop the session from this device.
    if (error) await auth.signOut({ scope: "local" });
  }, [auth]);

  const value = useMemo(
    () => ({ status, auth, signOut }),
    [status, auth, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
