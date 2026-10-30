import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { createApiFetch } from "./auth/api";
import { createSupabaseClient } from "./auth/supabase-client";
import { createFoodApi } from "./food/food-api";
import { createSupabaseTargetsStore } from "./settings/targets-store";
import {
  createSupabaseEntriesStore,
  type EntriesDb,
} from "./today/entries-store";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";

registerSW({ immediate: true });

const supabase = createSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App
        auth={supabase.auth}
        targets={createSupabaseTargetsStore(supabase)}
        // The client types the select string into a type too deep to compare; the store only needs EntriesDb.
        entries={createSupabaseEntriesStore(supabase as unknown as EntriesDb)}
        food={createFoodApi({
          apiFetch: createApiFetch(supabase.auth),
          db: supabase,
        })}
      />
    </BrowserRouter>
  </StrictMode>,
);
