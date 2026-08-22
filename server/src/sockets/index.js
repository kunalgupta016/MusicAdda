// ---------------------------------------------------------------------------
// Socket.io Connection Layer — with Auth Middleware
// ---------------------------------------------------------------------------
// SECURITY: The auth middleware runs once per connection and:
//   1. Validates that the client supplied a valid UUID clientId in auth
//   2. Stores it immutably in socket.data.clientId
//   3. This means event handlers read clientId from socket.data — a client
//      cannot change their identity after connecting by sending a different
//      clientId in event payloads.
// ---------------------------------------------------------------------------

import { registerRoomHandlers } from "./roomHandlers.js";
import { validateClientId } from "../utils/sanitize.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("socket");

export function registerSocketHandlers(io) {
  // Auth middleware — runs BEFORE the "connection" event fires.
  io.use((socket, next) => {
    const clientId = validateClientId(socket.handshake.auth?.clientId);
    if (!clientId) {
      log.warn(`Connection rejected: invalid clientId from ${socket.handshake.address}`);
      return next(new Error("Invalid or missing clientId in auth"));
    }
    socket.data.clientId = clientId;
    next();
  });

  io.on("connection", (socket) => {
    // Error handler for this socket
    socket.on("error", (err) => {
      log.error(`Socket ${socket.id} error:`, err.message);
    });

    registerRoomHandlers(io, socket);
  });
}
