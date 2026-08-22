// ---------------------------------------------------------------------------
// Socket Event Handlers — Security-Hardened
// ---------------------------------------------------------------------------
// Every handler now:
//   1. Validates & sanitizes ALL incoming fields (type + length + content)
//   2. Checks rate limits before processing
//   3. Enforces authorization (host-only actions)
//   4. Wraps async work in try-catch so no unhandled promise rejections
// ---------------------------------------------------------------------------

import {
  joinRoom,
  disconnectSocket,
  addHost,
  addToQueue,
  queueFromHistory,
  replayNow,
  removeFromQueue,
  voteForTrack,
  incrementRepeat,
  nextSong,
  trackEnded,
  setPlayback,
  sendMessage,
  serializeRoom,
  getRoom,
} from "../utils/roomManager.js";
import { extractYoutubeId, fetchYoutubeMeta } from "../utils/youtube.js";
import {
  validateRoomId,
  validateClientId,
  validateName,
  validateText,
  validateUrl,
  validateItemId,
  validateEmoji,
  validateTimestamp,
} from "../utils/sanitize.js";
import { createSocketRateLimiter } from "../utils/rateLimiter.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("socket");
const limiter = createSocketRateLimiter();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastState(io, roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  io.to(roomId).emit("sync-state", serializeRoom(room));
}

/** Shortcut: rate-limit check. Returns true if the event should be blocked. */
function rateLimited(socket, event, ack) {
  if (!limiter.allow(socket, event)) {
    ack?.({ ok: false, error: "Too many requests, slow down" });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Handler Registration
// ---------------------------------------------------------------------------

export function registerRoomHandlers(io, socket) {

  // -----------------------------------------------------------------------
  // JOIN ROOM
  // -----------------------------------------------------------------------
  socket.on("join-room", async (payload, ack) => {
    try {
      if (rateLimited(socket, "join-room", ack)) return;

      const roomId   = validateRoomId(payload?.roomId);
      // clientId comes from socket auth middleware (tamper-proof), not payload
      const clientId = socket.data.clientId;
      const name     = validateName(payload?.name) || "Anonymous";

      if (!roomId || !clientId) {
        return ack?.({ ok: false, error: "Missing or invalid roomId / clientId" });
      }

      const result = await joinRoom(roomId, clientId, socket.id, name);

      if (result === "ROOM_FULL") {
        return ack?.({ ok: false, error: "Room is full (max 50 users)" });
      }
      if (!result) {
        return ack?.({ ok: false, error: "Room not found" });
      }

      socket.data.roomId = roomId;
      socket.join(roomId);

      ack?.({ ok: true, state: serializeRoom(result), chatHistory: result.messages.slice(-50) });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("join-room error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // ADD TO QUEUE
  // -----------------------------------------------------------------------
  socket.on("add-to-queue", async (payload, ack) => {
    try {
      if (rateLimited(socket, "add-to-queue", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const url = validateUrl(payload?.url);
      if (!url) return ack?.({ ok: false, error: "Invalid URL" });

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
        addedByClientId: clientId,
      });

      if (updated === "QUEUE_FULL") return ack?.({ ok: false, error: "Queue is full (max 100 tracks)" });
      if (!updated) return ack?.({ ok: false, error: "Room not found" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("add-to-queue error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // REMOVE FROM QUEUE — host or track owner only
  // -----------------------------------------------------------------------
  socket.on("remove-from-queue", (payload, ack) => {
    try {
      if (rateLimited(socket, "remove-from-queue", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const itemId = validateItemId(payload?.itemId);
      if (!itemId) return ack?.({ ok: false, error: "Invalid itemId" });

      const updated = removeFromQueue(roomId, itemId, clientId);
      if (updated === "NOT_AUTHORIZED") return ack?.({ ok: false, error: "Only the host or the track owner can remove it" });
      if (!updated) return ack?.({ ok: false, error: "Track not found in queue" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("remove-from-queue error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // VOTE
  // -----------------------------------------------------------------------
  socket.on("vote-queue-item", (payload, ack) => {
    try {
      if (rateLimited(socket, "vote-queue-item", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const itemId = validateItemId(payload?.itemId);
      if (!itemId) return ack?.({ ok: false, error: "Invalid itemId" });

      const updated = voteForTrack(roomId, itemId, clientId);
      if (!updated) return ack?.({ ok: false, error: "Track not found in queue" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("vote-queue-item error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // INCREMENT REPEAT — host only
  // -----------------------------------------------------------------------
  socket.on("increment-repeat", (payload, ack) => {
    try {
      if (rateLimited(socket, "increment-repeat", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const itemId = validateItemId(payload?.itemId);
      if (!itemId) return ack?.({ ok: false, error: "Invalid itemId" });

      const updated = incrementRepeat(roomId, itemId, clientId);
      if (updated === "NOT_HOST") return ack?.({ ok: false, error: "Only a host can change repeat count" });
      if (!updated) return ack?.({ ok: false, error: "Track not found" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("increment-repeat error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // QUEUE FROM HISTORY
  // -----------------------------------------------------------------------
  socket.on("queue-from-history", async (payload, ack) => {
    try {
      if (rateLimited(socket, "queue-from-history", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const historyItemId = validateItemId(payload?.historyItemId);
      if (!historyItemId) return ack?.({ ok: false, error: "Invalid historyItemId" });

      const room = getRoom(roomId);
      const addedBy = room?.users.get(clientId)?.name ?? "Unknown";
      const updated = await queueFromHistory(roomId, historyItemId, addedBy, clientId);
      if (updated === "QUEUE_FULL") return ack?.({ ok: false, error: "Queue is full" });
      if (!updated) return ack?.({ ok: false, error: "Not found in history" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("queue-from-history error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // REPLAY NOW — host only
  // -----------------------------------------------------------------------
  socket.on("replay-now", (payload, ack) => {
    try {
      if (rateLimited(socket, "replay-now", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const historyItemId = validateItemId(payload?.historyItemId);
      if (!historyItemId) return ack?.({ ok: false, error: "Invalid historyItemId" });

      const room = getRoom(roomId);
      const addedBy = room?.users.get(clientId)?.name ?? "Unknown";
      const updated = replayNow(roomId, clientId, historyItemId, addedBy);
      if (!updated) return ack?.({ ok: false, error: "Only a host can replay a track immediately" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("replay-now error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // CHAT MESSAGE
  // -----------------------------------------------------------------------
  socket.on("chat-message", (payload, ack) => {
    try {
      if (rateLimited(socket, "chat-message", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const trimmed = validateText(payload?.text);
      if (!trimmed) return ack?.({ ok: false, error: "Message is empty or invalid" });

      const room = getRoom(roomId);
      const name = room?.users.get(clientId)?.name ?? "Unknown";
      const message = sendMessage(roomId, clientId, name, trimmed);
      if (!message) return ack?.({ ok: false, error: "Room not found" });

      ack?.({ ok: true });
      io.to(roomId).emit("chat-message", message);
    } catch (err) {
      log.error("chat-message error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // REACTION — ephemeral relay
  // -----------------------------------------------------------------------
  socket.on("reaction", (payload) => {
    try {
      if (!limiter.allow(socket, "reaction")) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return;

      const emoji = validateEmoji(payload?.emoji);
      if (!emoji) return;

      const room = getRoom(roomId);
      const name = room?.users.get(clientId)?.name ?? "Someone";
      io.to(roomId).emit("reaction", { emoji, name });
    } catch (err) {
      log.error("reaction error:", err.message);
    }
  });

  // -----------------------------------------------------------------------
  // NEXT SONG (Skip) — host only
  // -----------------------------------------------------------------------
  socket.on("next-song", (_payload, ack) => {
    try {
      if (rateLimited(socket, "next-song", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const updated = nextSong(roomId, clientId);
      if (updated === "NOT_HOST") return ack?.({ ok: false, error: "Only a host can skip" });
      if (!updated) return ack?.({ ok: false, error: "Room not found" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("next-song error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // TRACK ENDED — debounced, natural end-of-track
  // -----------------------------------------------------------------------
  socket.on("track-ended", (_payload, ack) => {
    try {
      if (rateLimited(socket, "track-ended", ack)) return;

      const { roomId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const updated = trackEnded(roomId);
      if (!updated) return ack?.({ ok: false, error: "Room not found" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("track-ended error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // PLAYBACK CONTROLS — host only (play / pause / seek)
  // -----------------------------------------------------------------------
  socket.on("play", (payload, ack) => {
    try {
      const ts = validateTimestamp(payload?.timestamp);
      handlePlayback(socket, io, ack, { isPlaying: true, timestamp: ts ?? 0 });
    } catch (err) {
      log.error("play error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  socket.on("pause", (payload, ack) => {
    try {
      const ts = validateTimestamp(payload?.timestamp);
      handlePlayback(socket, io, ack, { isPlaying: false, timestamp: ts ?? 0 });
    } catch (err) {
      log.error("pause error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  socket.on("seek", (payload, ack) => {
    try {
      const ts = validateTimestamp(payload?.timestamp);
      if (ts === null) return ack?.({ ok: false, error: "Invalid timestamp" });
      handlePlayback(socket, io, ack, { timestamp: ts });
    } catch (err) {
      log.error("seek error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // MAKE HOST — host only can grant
  // -----------------------------------------------------------------------
  socket.on("make-host", (payload, ack) => {
    try {
      if (rateLimited(socket, "make-host", ack)) return;

      const { roomId, clientId } = socket.data;
      if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

      const targetClientId = validateClientId(payload?.targetClientId);
      if (!targetClientId) return ack?.({ ok: false, error: "Invalid targetClientId" });

      const updated = addHost(roomId, clientId, targetClientId);
      if (!updated) return ack?.({ ok: false, error: "Only a host can grant host access" });
      ack?.({ ok: true });
      broadcastState(io, roomId);
    } catch (err) {
      log.error("make-host error:", err.message);
      ack?.({ ok: false, error: "Internal error" });
    }
  });

  // -----------------------------------------------------------------------
  // DISCONNECT
  // -----------------------------------------------------------------------
  socket.on("disconnect", () => {
    try {
      const { roomId, clientId } = socket.data;
      if (!roomId || !clientId) return;

      disconnectSocket(roomId, clientId, socket.id);
      broadcastState(io, roomId);
    } catch (err) {
      log.error("disconnect error:", err.message);
    }
  });
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function handlePlayback(socket, io, ack, changes) {
  if (rateLimited(socket, "playback", ack)) return;

  const { roomId, clientId } = socket.data;
  if (!roomId) return ack?.({ ok: false, error: "Not in a room" });

  const updated = setPlayback(roomId, clientId, changes);
  if (!updated) return ack?.({ ok: false, error: "Only a host can control playback" });
  ack?.({ ok: true });
  broadcastState(io, roomId);
}
