import { existsSync } from "node:fs";
/** Same explicit local-browser override and sandbox contract as browser-smoke. */
export function browserLaunchOptions() {
  return {
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE
      ? { executablePath: process.env.BROWSER_EXECUTABLE }
      : existsSync("/usr/bin/chromium")
        ? { executablePath: "/usr/bin/chromium" }
        : {}),
    args: [
      "--disable-dev-shm-usage",
      ...(process.env.BROWSER_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
    ],
  };
}
