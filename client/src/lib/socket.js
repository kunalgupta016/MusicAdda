import { io } from "socket.io-client";
import { getClientId } from "./identity";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

// ---------------------------------------------------------------------------
// SECURITY: Pass the clientId in the auth handshake so the server can bind
// it immutably to the socket session. This prevents a malicious client from
// changing their identity per-event after connecting.
// ---------------------------------------------------------------------------
export const socket = io(SERVER_URL, {
  autoConnect: false,
  auth: {
    clientId: getClientId(),
  },
});
