import { appName } from "@disciplined-sidekick/core";

export function appTitle(): string {
  return appName();
}

/** The build this runs: the short commit SHA on Vercel, otherwise "dev". */
export function appVersion(): string {
  return import.meta.env.VITE_APP_VERSION || "dev";
}
