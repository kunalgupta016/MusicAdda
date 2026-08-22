// ---------------------------------------------------------------------------
// Structured Logger
// ---------------------------------------------------------------------------
// Replaces raw console.log/warn/error with a logger that:
//   • Adds ISO timestamps to every entry
//   • Tags each entry with a level (INFO / WARN / ERROR)
//   • Outputs JSON in production for log-aggregation tools
//   • Never logs sensitive data (connection strings, passwords)
// ---------------------------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Patterns that should never appear in log output.
const SENSITIVE_PATTERNS = [
  /mongodb(\+srv)?:\/\/[^\s]+/gi,   // MongoDB URIs
  /password[=:]\s*\S+/gi,           // password=… or password: …
  /Bearer\s+\S+/gi,                 // JWT tokens
];

function redact(message) {
  let safe = String(message);
  for (const pattern of SENSITIVE_PATTERNS) {
    safe = safe.replace(pattern, "[REDACTED]");
  }
  return safe;
}

function formatArgs(args) {
  return args.map((a) => (typeof a === "string" ? redact(a) : a));
}

function emit(level, tag, args) {
  const ts = new Date().toISOString();
  const safeArgs = formatArgs(args);

  if (IS_PRODUCTION) {
    // Structured JSON line — one object per log entry.
    const entry = {
      ts,
      level,
      tag,
      msg: safeArgs.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "),
    };
    // eslint-disable-next-line no-console
    (level === "ERROR" ? console.error : console.log)(JSON.stringify(entry));
  } else {
    const prefix = `${ts} [${level}] [${tag}]`;
    // eslint-disable-next-line no-console
    (level === "ERROR" ? console.error : console.log)(prefix, ...safeArgs);
  }
}

/** Create a scoped logger for a subsystem (e.g. "db", "socket", "server"). */
export function createLogger(tag) {
  return {
    info:  (...args) => emit("INFO",  tag, args),
    warn:  (...args) => emit("WARN",  tag, args),
    error: (...args) => emit("ERROR", tag, args),
  };
}

// Default logger for quick one-off usage.
const log = createLogger("app");
export default log;
