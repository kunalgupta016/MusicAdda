import { registerRoomHandlers } from "./roomHandlers.js";

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.data = {};
    registerRoomHandlers(io, socket);
  });
}
