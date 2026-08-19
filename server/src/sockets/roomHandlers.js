import {
  joinRoom,
  disconnectSocket,
  transferControl,
  addToQueue,
  replayFromHistory,
  removeFromQueue,
  voteForTrack,
  nextSong,
  setPlayback,
  sendMessage,
  serializeRoom,
  getRoom,
} from "../utils/roomManager.js";
import { extractYoutubeId, fetchYoutubeMeta } from "../utils/youtube.js";

function broadcastState(io, roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  io.to(roomId).emit("sync-state", serializeRoom(room));
}

export function registerRoomHandlers(io, socket) {
  socket.on("join-room", async ({ roomId, clientId, name }, ack) => {
    if (!roomId || !clientId) return ack?.({ ok: false, error: "Missing roomId or clientId" });

    const room = await joinRoom(roomId, clientId, socket.id, name?.trim() || "Anonymous");
    if (!room) return ack?.({ ok: false, error: "Room not found" });

    socket.data.roomId = roomId;
    socket.data.clientId = clientId;
    socket.join(roomId);

    // Chat history rides along with the join ack (not sync-state) since it's
    // only needed once, on entry — new messages after that arrive one at a
    // time over the "chat-message" event instead of resending the whole log.
    ack?.({ ok: true, state: serializeRoom(room), chatHistory: room.messages.slice(-50) });
    broadcastState(io, roomId);
  });

  socket.on("add-to-queue", async ({ url }, ack) => {
    const { roomId, clientId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const videoId = extractYoutubeId(url);
    if (!videoId) return ack?.({ ok: false, error: "Couldn't find a YouTube video in that link" });

    const room = getRoom(roomId);
    const addedBy = room?.users.get(clientId)?.name ?? "Unknown";
    const meta = await fetchYoutubeMeta(videoId);

    const updated = await addToQueue(roomId, {
      source: "youtube",
      trackId: videoId,
      title: meta.title,
      thumbnail: meta.thumbnail,
      addedBy,
    });

    if (!updated) return ack?.({ ok: false, error: "Room not found" });
    ack?.({ ok: true });
    broadcastState(io, roomId);
  });

  socket.on("remove-from-queue", ({ itemId }, ack) => {
    const { roomId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const updated = removeFromQueue(roomId, itemId);
    if (!updated) return ack?.({ ok: false, error: "Room not found" });
    ack?.({ ok: true });
    broadcastState(io, roomId);
  });

  socket.on("vote-queue-item", ({ itemId }, ack) => {
    const { roomId, clientId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const updated = voteForTrack(roomId, itemId, clientId);
    if (!updated) return ack?.({ ok: false, error: "Track not found in queue" });
    ack?.({ ok: true });
    broadcastState(io, roomId);
  });

  socket.on("replay-track", async ({ historyItemId }, ack) => {
    const { roomId, clientId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const room = getRoom(roomId);
    const addedBy = room?.users.get(clientId)?.name ?? "Unknown";
    const updated = await replayFromHistory(roomId, historyItemId, addedBy);
    if (!updated) return ack?.({ ok: false, error: "Not found in history" });
    ack?.({ ok: true });
    broadcastState(io, roomId);
  });

  socket.on("chat-message", ({ text }, ack) => {
    const { roomId, clientId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const trimmed = (text ?? "").trim().slice(0, 500);
    if (!trimmed) return ack?.({ ok: false, error: "Message is empty" });

    const room = getRoom(roomId);
    const name = room?.users.get(clientId)?.name ?? "Unknown";
    const message = sendMessage(roomId, clientId, name, trimmed);
    if (!message) return ack?.({ ok: false, error: "Room not found" });

    ack?.({ ok: true });
    io.to(roomId).emit("chat-message", message);
  });

  // Pure ephemeral relay — no room state, no persistence. Every connected
  // client just gets told "someone reacted with X" and animates it locally.
  socket.on("reaction", ({ emoji }) => {
    const { roomId, clientId } = socket.data;
    if (!roomId || typeof emoji !== "string" || !emoji) return;

    const room = getRoom(roomId);
    const name = room?.users.get(clientId)?.name ?? "Someone";
    io.to(roomId).emit("reaction", { emoji: emoji.slice(0, 8), name });
  });

  socket.on("next-song", (_payload, ack) => {
    const { roomId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const updated = nextSong(roomId);
    if (!updated) return ack?.({ ok: false, error: "Room not found" });
    ack?.({ ok: true });
    broadcastState(io, roomId);
  });

  socket.on("play", ({ timestamp }, ack) => handlePlayback(socket, io, ack, { isPlaying: true, timestamp }));
  socket.on("pause", ({ timestamp }, ack) => handlePlayback(socket, io, ack, { isPlaying: false, timestamp }));
  socket.on("seek", ({ timestamp }, ack) => handlePlayback(socket, io, ack, { timestamp }));

  socket.on("transfer-control", ({ targetClientId }, ack) => {
    const { roomId, clientId } = socket.data;
    if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

    const updated = transferControl(roomId, clientId, targetClientId);
    if (!updated) return ack?.({ ok: false, error: "Only the host can hand off control" });
    ack?.({ ok: true });
    broadcastState(io, roomId);
  });

  socket.on("disconnect", () => {
    const { roomId, clientId } = socket.data;
    if (!roomId || !clientId) return;

    disconnectSocket(roomId, clientId, socket.id);
    broadcastState(io, roomId);
  });
}

function handlePlayback(socket, io, ack, changes) {
  const { roomId, clientId } = socket.data;
  if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

  const updated = setPlayback(roomId, clientId, changes);
  if (!updated) return ack?.({ ok: false, error: "Only the host can control playback" });
  ack?.({ ok: true });
  broadcastState(io, roomId);
}
