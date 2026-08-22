// ---------------------------------------------------------------------------
// Input Validation & Sanitization
// ---------------------------------------------------------------------------
// Guards every socket-event and HTTP-request payload against:
//   • NoSQL operator injection  ($gt, $ne, $regex …)
//   • HTML / script injection   (strips all tags)
//   • Type-confusion attacks    (rejects non-primitive types)
//   • Control-character abuse   (RTL overrides, zero-width joiners)
//   • Oversized payloads        (enforces per-field max lengths)
// ---------------------------------------------------------------------------

import validator from "validator";

// Characters that can break rendering or spoof UI.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2066-\u2069\uFEFF]/g;

// MongoDB query operator keys that must never appear in user input.
const MONGO_OPERATORS = /^\$/;

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Return true if `val` is a plain string (not an object/array). */
function isString(val) {
  return typeof val === "string";
}

/** Reject any value that is an object containing $ keys (operator injection). */
function containsOperator(val) {
  if (val && typeof val === "object") {
    return Object.keys(val).some((k) => MONGO_OPERATORS.test(k));
  }
  return false;
}

/**
 * Sanitize a string value:
 *  1. Enforce it really is a string
 *  2. Strip HTML tags
 *  3. Remove dangerous control characters
 *  4. Trim whitespace
 *  5. Enforce max length
 */
export function sanitizeString(value, maxLength = 500) {
  if (!isString(value)) return null;
  let clean = validator.stripLow(value, /* keep_newlines */ false);
  clean = validator.escape(clean);            // HTML-entity-encode < > & " '
  clean = clean.replace(CONTROL_CHARS, "");   // extra safety: remove RTL etc.
  clean = clean.trim();
  if (clean.length > maxLength) clean = clean.slice(0, maxLength);
  return clean || null;
}

/**
 * Lighter sanitization for display-text like chat messages where we want to
 * keep the original characters but strip HTML tags and control chars.
 * Does NOT entity-encode — React's JSX already escapes text nodes.
 */
export function sanitizeText(value, maxLength = 500) {
  if (!isString(value)) return null;
  let clean = validator.stripLow(value, false);
  clean = clean.replace(/<[^>]*>/g, "");      // strip HTML tags
  clean = clean.replace(CONTROL_CHARS, "");
  clean = clean.trim();
  if (clean.length > maxLength) clean = clean.slice(0, maxLength);
  return clean || null;
}

// ---------------------------------------------------------------------------
// Field-specific validators
// ---------------------------------------------------------------------------

/** Room ID: 6-10 lowercase alphanumeric characters. */
export function validateRoomId(value) {
  if (containsOperator(value)) return null;
  if (!isString(value)) return null;
  const clean = value.trim().toLowerCase();
  if (clean.length < 6 || clean.length > 10) return null;
  if (!/^[a-z0-9]+$/.test(clean)) return null;
  return clean;
}

/** Client ID: must look like a UUID v4. */
export function validateClientId(value) {
  if (containsOperator(value)) return null;
  if (!isString(value)) return null;
  return validator.isUUID(value, 4) ? value : null;
}

/** User display name: 1-30 chars, basic printable characters + spaces. */
export function validateName(value) {
  if (containsOperator(value)) return null;
  const clean = sanitizeText(value, 30);
  if (!clean || clean.length < 1) return null;
  return clean;
}

/** Chat / message text: 1-500 chars. */
export function validateText(value) {
  if (containsOperator(value)) return null;
  return sanitizeText(value, 500);
}

/** URL string: must be a valid http/https URL. */
export function validateUrl(value) {
  if (containsOperator(value)) return null;
  if (!isString(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length > 2048) return null;
  if (!validator.isURL(trimmed, { protocols: ["http", "https"], require_protocol: true })) {
    // Also accept short youtube links without protocol
    if (!validator.isURL(trimmed, { protocols: ["http", "https"], require_protocol: false })) {
      return null;
    }
  }
  return trimmed;
}

/** Item ID (nanoid): alphanumeric + hyphen/underscore, max 20 chars. */
export function validateItemId(value) {
  if (containsOperator(value)) return null;
  if (!isString(value)) return null;
  const clean = value.trim();
  if (clean.length < 1 || clean.length > 20) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return null;
  return clean;
}

/** Emoji: 1-8 chars, must contain at least one emoji-range character. */
export function validateEmoji(value) {
  if (!isString(value)) return null;
  const clean = value.slice(0, 8);
  // Very broad emoji range check — covers most emoji blocks.
  // eslint-disable-next-line no-misleading-character-class
  if (!/[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u2764\u2665\u270A-\u270D]/u.test(clean)) {
    return null;
  }
  return clean;
}

/** Timestamp: must be a finite non-negative number. */
export function validateTimestamp(value) {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Generic guard: reject anything that smells like a NoSQL operator. */
export function rejectOperators(obj) {
  if (obj && typeof obj === "object") {
    return !containsOperator(obj);
  }
  return true;
}
