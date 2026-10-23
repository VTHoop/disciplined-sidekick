import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseClient } from "./supabase-client";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: {} })),
}));

describe("createSupabaseClient", () => {
  it("keeps the session on the device and refreshes it until sign-out", () => {
    createSupabaseClient("https://example.supabase.co", "anon-key");
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      {
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
          storage: window.localStorage,
        }),
      },
    );
  });

  it("returns the Supabase client", () => {
    expect(createSupabaseClient("u", "k")).toEqual({ auth: {} });
  });
});
