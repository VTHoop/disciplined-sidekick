import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { appVersion } from "./app-info";
import { createApiFetch } from "./auth/api";
import { createSupabaseClient } from "./auth/supabase-client";
import {
  type ClientErrorsDb,
  createClientErrorRecorder,
} from "./client-errors";
import { createFoodApi, type FoodDb } from "./food/food-api";
import { createSupabaseTargetsStore } from "./settings/targets-store";
import {
  createSupabaseEntriesStore,
  type EntriesDb,
} from "./today/entries-store";
import { createUpdateController } from "./update/update-controller";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";

// The waiting version is applied only when the user taps Reload.
const updates = createUpdateController(registerSW);

const supabase = createSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// The client types its builders too deep to compare; each store needs only its own slice.
const record = createClientErrorRecorder({
  db: supabase as unknown as ClientErrorsDb,
  version: appVersion(),
  online: () => navigator.onLine,
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App
        updates={updates}
        auth={supabase.auth}
        targets={createSupabaseTargetsStore(supabase, record)}
        // The client types the select string into a type too deep to compare; the store only needs EntriesDb.
        entries={createSupabaseEntriesStore(
          supabase as unknown as EntriesDb,
          record,
        )}
        food={createFoodApi({
          apiFetch: createApiFetch(supabase.auth),
          db: supabase as unknown as FoodDb,
          record,
        })}
      />
    </BrowserRouter>
  </StrictMode>,
);
