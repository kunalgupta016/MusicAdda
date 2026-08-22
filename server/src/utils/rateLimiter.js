// ---------------------------------------------------------------------------
// Per-Socket Rate Limiter
// ---------------------------------------------------------------------------
// Sliding-window counter per socket per event bucket. After 5 violations
// in a single connection, the socket is forcibly disconnected.
//
// Usage:
//   const limiter = createSocketRateLimiter();
//   // Inside a handler:
//   if (!limiter.allow(socket, "chat-message")) return ack?.({ ok: false, error: "Too many requests" });
// ---------------------------------------------------------------------------

import { createLogger } from "./logger.js";
const log = createLogger("rate-limit");

// Default limits: { windowMs, max }
const DEFAULT_LIMITS = {
  "join-room":       { windowMs: 30_000, max: 3  },
  "chat-message":    { windowMs: 10_000, max: 5  },
  "add-to-queue":    { windowMs: 10_000, max: 3  },
  "reaction":        { windowMs: 10_000, max: 10 },
  __default:         { windowMs: 10_000, max: 20 },
};

const MAX_VIOLATIONS_BEFORE_DISCONNECT = 5;

export function createSocketRateLimiter(customLimits = {}) {
  const limits = { ...DEFAULT_LIMITS, ...customLimits };

  // socket.id → { bucket → [timestamps], violations }
  const state = new Map();

  function getSocketState(socket) {
    if (!state.has(socket.id)) {
      state.set(socket.id, { buckets: {}, violations: 0 });

      // Auto-cleanup when socket disconnects.
      socket.once("disconnect", () => state.delete(socket.id));
    }
    return state.get(socket.id);
  }

  /**
   * Returns `true` if the event is allowed, `false` if rate-limited.
   * When `false`, the caller should reply with an error and NOT process
   * the event.
   */
  function allow(socket, eventName) {
    const config = limits[eventName] || limits.__default;
    const ss = getSocketState(socket);

    const now = Date.now();
    const bucket = (ss.buckets[eventName] ??= []);

    // Slide the window: drop timestamps older than the window.
    const cutoff = now - config.windowMs;
    while (bucket.length > 0 && bucket[0] < cutoff) bucket.shift();

    if (bucket.length >= config.max) {
      ss.violations += 1;
      log.warn(`Socket ${socket.id} rate-limited on "${eventName}" (violation #${ss.violations})`);

      if (ss.violations >= MAX_VIOLATIONS_BEFORE_DISCONNECT) {
        log.warn(`Socket ${socket.id} disconnected after ${ss.violations} rate-limit violations`);
        socket.emit("error-message", { error: "Disconnected: too many rate-limit violations" });
        socket.disconnect(true);
      }
      return false;
    }

    bucket.push(now);
    return true;
  }

  return { allow };
}
