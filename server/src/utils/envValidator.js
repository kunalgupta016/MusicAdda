// ---------------------------------------------------------------------------
// Environment Variable Validation
// ---------------------------------------------------------------------------
// Runs once at startup to catch misconfiguration early. Warns on missing
// optional vars, crashes on invalid required vars so the app never runs
// in a silently broken state.
// ---------------------------------------------------------------------------

import { createLogger } from "./logger.js";
const log = createLogger("env");

export function validateEnv() {
  const errors = [];

  // -- PORT (optional, defaults to 4000) --
  if (process.env.PORT) {
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push(`PORT must be an integer between 1 and 65535 (got "${process.env.PORT}")`);
    }
  }

  // -- CLIENT_ORIGIN (optional, defaults to localhost) --
  if (process.env.CLIENT_ORIGIN) {
    try {
      new URL(process.env.CLIENT_ORIGIN);
    } catch {
      errors.push(`CLIENT_ORIGIN must be a valid URL (got "${process.env.CLIENT_ORIGIN}")`);
    }
  }

  // -- MONGODB_URI (optional, but validated if present) --
  if (process.env.MONGODB_URI) {
    if (!process.env.MONGODB_URI.startsWith("mongodb")) {
      errors.push(`MONGODB_URI must start with "mongodb" (got "${process.env.MONGODB_URI.slice(0, 10)}…")`);
    }
  } else {
    log.warn("MONGODB_URI not set — running without persistence (rooms live in memory only)");
  }

  if (errors.length > 0) {
    for (const msg of errors) log.error(msg);
    log.error("Fix the environment variables above and restart.");
    process.exit(1);
  }

  log.info("Environment variables validated OK");
}
