// ---------------------------------------------------------------------------
// Room Manager — In-memory state + MongoDB persistence
// ---------------------------------------------------------------------------
// Security hardening applied:
//   • Room ID length increased from 6 → 8 (~852 B combinations)
//   • MAX_ROOMS cap to prevent resource exhaustion
//   • Room TTL — evict rooms with zero connected users for > 30 min
//   • Max 50 users per room
//   • Max 100 items in queue
//   • addedByClientId tracked for permission-checked removal
//   • track-ended debounce to prevent rapid queue drain
//   • Structured logging (never leaks sensitive data)
// ---------------------------------------------------------------------------

import { nanoid, customAlphabet } from "nanoid";
import Room from "../models/Room.js";
import { isDbConnected } from "../config/db.js";
import { createLogger } from "./logger.js";

const log = createLogger("roomManager");

// ---------------------------------------------------------------------------
// Constants & Limits
// ---------------------------------------------------------------------------

const roomIdAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars
const ROOM_ID_LENGTH = 8; // was 6 → 31^8 ≈ 852 B combinations
const generateRoomId = customAlphabet(roomIdAlphabet, ROOM_ID_LENGTH);

const MAX_ROOMS         = 1000;
const MAX_USERS_PER_ROOM = 50;
const MAX_QUEUE_SIZE    = 100;
const MAX_HISTORY       = 50;
const MAX_MESSAGES      = 200;
const MAX_REPEAT        = 10;
const ROOM_TTL_MS       = 30 * 60 * 1000;           // 30 minutes with 0 users
const CLEANUP_INTERVAL  = 5 * 60 * 1000;             // run cleanup every 5 min
const TRACK_ENDED_DEBOUNCE_MS = 3000;                // 3 s debounce

// In-memory source of truth for active rooms. MongoDB is used only for
// durability (surviving server restarts) — every real-time read/write
// happens against this map so playback stays low-latency.
const rooms = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshPlaybackState() {
  return { isPlaying: false, timestamp: 0, updatedAt: Date.now() };
}

function newRoomState(roomId) {
  return {
    roomId,
    hostClientIds: new Set(),
    users: new Map(),               // clientId -> { name, socketId, connected }
    queue: [],
    currentTrack: null,
    playbackState: freshPlaybackState(),
    history: [],                    // most-recently-played first, capped at MAX_HISTORY
    messages: [],                   // chat log, capped at MAX_MESSAGES
    lastEmptyAt: null,              // timestamp when last user disconnected (for TTL)
    lastTrackEndedAt: 0,            // debounce guard for track-ended events
  };
}

function persist(room) {
  if (!isDbConnected()) return;
  Room.findOneAndUpdate(
    { roomId: room.roomId },
    {
      roomId: room.roomId,
      hostClientIds: Array.from(room.hostClientIds),
      queue: room.queue,
      currentTrack: room.currentTrack,
      playbackState: room.playbackState,
      history: room.history,
      messages: room.messages,
      lastActiveAt: new Date(),
    },
    { upsert: true }
  ).catch((err) => log.error(`persist failed for ${room.roomId}:`, err.message));
}

function sortQueueByVotes(room) {
  room.queue.sort((a, b) => b.votes.length - a.votes.length || a.addedAt - b.addedAt);
}

function hasConnectedHost(room) {
  return Array.from(room.hostClientIds).some((id) => room.users.get(id)?.connected);
}

function countConnectedUsers(room) {
  let count = 0;
  for (const u of room.users.values()) if (u.connected) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Room TTL Cleanup (runs every CLEANUP_INTERVAL)
// ---------------------------------------------------------------------------

function cleanupStaleRooms() {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (countConnectedUsers(room) === 0) {
      if (!room.lastEmptyAt) {
        room.lastEmptyAt = now;
      } else if (now - room.lastEmptyAt > ROOM_TTL_MS) {
        rooms.delete(roomId);
        log.info(`Evicted stale room ${roomId} (no users for ${Math.round(ROOM_TTL_MS / 60000)} min)`);
      }
    } else {
      room.lastEmptyAt = null; // reset — someone is still connected
    }
  }
}

const _cleanupTimer = setInterval(cleanupStaleRooms, CLEANUP_INTERVAL);
// Allow the Node process to exit even if the timer is still running.
if (_cleanupTimer.unref) _cleanupTimer.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createRoom() {
  // SECURITY: prevent resource exhaustion
  if (rooms.size >= MAX_ROOMS) {
    log.warn(`Room creation rejected — MAX_ROOMS (${MAX_ROOMS}) reached`);
    return null;
  }

  let roomId = generateRoomId();
  while (rooms.has(roomId)) roomId = generateRoomId();

  const room = newRoomState(roomId);
  rooms.set(roomId, room);
  persist(room);
  return roomId;
}

export async function roomExists(roomId) {
  if (rooms.has(roomId)) return true;
  if (isDbConnected()) {
    const doc = await Room.findOne({ roomId }).lean();
    return !!doc;
  }
  return false;
}

async function loadRoom(roomId) {
  if (rooms.has(roomId)) return rooms.get(roomId);

  if (isDbConnected()) {
    const doc = await Room.findOne({ roomId }).lean();
    if (doc) {
      const room = newRoomState(roomId);
      room.hostClientIds = new Set(doc.hostClientIds ?? []);
      room.queue = doc.queue ?? [];
      room.currentTrack = doc.currentTrack ?? null;
      room.playbackState = doc.playbackState ?? freshPlaybackState();
      room.history = doc.history ?? [];
      room.messages = doc.messages ?? [];
      rooms.set(roomId, room);
      return room;
    }
  }
  return null;
}

export function serializeRoom(room) {
  return {
    roomId: room.roomId,
    hostClientIds: Array.from(room.hostClientIds),
    users: Array.from(room.users.entries())
      .filter(([, u]) => u.connected)
      .map(([clientId, u]) => ({
        clientId,
        name: u.name,
        isHost: room.hostClientIds.has(clientId),
      })),
    queue: room.queue,
    currentTrack: room.currentTrack,
    playbackState: room.playbackState,
    history: room.history,
  };
}

export async function joinRoom(roomId, clientId, socketId, name) {
  const room = await loadRoom(roomId);
  if (!room) return null;

  // SECURITY: limit max users per room
  const existingUser = room.users.get(clientId);
  if (!existingUser && countConnectedUsers(room) >= MAX_USERS_PER_ROOM) {
    return "ROOM_FULL";
  }

  const hadNoConnectedUsers = Array.from(room.users.values()).every((u) => !u.connected);

  room.users.set(clientId, { name, socketId, connected: true });
  room.lastEmptyAt = null; // room is active

  if (!hasConnectedHost(room)) {
    room.hostClientIds.add(clientId);
  }

  if (hadNoConnectedUsers) persist(room);
  return room;
}

export function getRoom(roomId) {
  return rooms.get(roomId) ?? null;
}

export function disconnectSocket(roomId, clientId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const user = room.users.get(clientId);
  if (!user || user.socketId !== socketId) return room;

  user.connected = false;
  room.hostClientIds.delete(clientId);

  if (!hasConnectedHost(room)) {
    const nextUser = Array.from(room.users.entries()).find(([, u]) => u.connected);
    if (nextUser) room.hostClientIds.add(nextUser[0]);
  }

  // Mark when the room became empty (for TTL cleanup)
  if (countConnectedUsers(room) === 0) {
    room.lastEmptyAt = Date.now();
  }

  return room;
}

export function addHost(roomId, requesterClientId, targetClientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.hostClientIds.has(requesterClientId)) return null;
  if (!room.users.get(targetClientId)?.connected) return null;

  room.hostClientIds.add(targetClientId);
  persist(room);
  return room;
}

export async function addToQueue(roomId, { source = "youtube", trackId, title, thumbnail, addedBy, addedByClientId = "" }) {
  const room = await loadRoom(roomId);
  if (!room) return null;

  if (room.currentTrack?.source === source && room.currentTrack?.trackId === trackId) {
    room.currentTrack.repeatCount = Math.min(MAX_REPEAT, (room.currentTrack.repeatCount ?? 1) + 1);
    persist(room);
    return room;
  }

  const existing = room.queue.find((i) => i.source === source && i.trackId === trackId);
  if (existing) {
    existing.repeatCount = Math.min(MAX_REPEAT, (existing.repeatCount ?? 1) + 1);
    persist(room);
    return room;
  }

  // SECURITY: enforce queue size limit
  if (room.queue.length >= MAX_QUEUE_SIZE) {
    return "QUEUE_FULL";
  }

  const item = {
    itemId: nanoid(10),
    source,
    trackId,
    title,
    thumbnail,
    addedBy,
    addedByClientId,
    addedAt: new Date(),
    votes: [],
    repeatCount: 1,
  };

  if (!room.currentTrack) {
    room.currentTrack = item;
    room.playbackState = freshPlaybackState();
  } else {
    room.queue.push(item);
    sortQueueByVotes(room);
  }

  persist(room);
  return room;
}

// SECURITY: only hosts can change repeat count
export function incrementRepeat(roomId, itemId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  // Permission: only hosts may change repeat
  if (!room.hostClientIds.has(clientId)) return "NOT_HOST";

  if (room.currentTrack?.itemId === itemId) {
    room.currentTrack.repeatCount = ((room.currentTrack.repeatCount ?? 1) % MAX_REPEAT) + 1;
    persist(room);
    return room;
  }

  const item = room.queue.find((i) => i.itemId === itemId);
  if (!item) return null;
  item.repeatCount = ((item.repeatCount ?? 1) % MAX_REPEAT) + 1;
  persist(room);
  return room;
}

export async function queueFromHistory(roomId, historyItemId, addedBy, addedByClientId = "") {
  const room = rooms.get(roomId);
  if (!room) return null;
  const original = room.history.find((h) => h.itemId === historyItemId);
  if (!original) return null;

  return addToQueue(roomId, {
    source: original.source,
    trackId: original.trackId,
    title: original.title,
    thumbnail: original.thumbnail,
    addedBy,
    addedByClientId,
  });
}

export function replayNow(roomId, clientId, historyItemId, addedBy) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.hostClientIds.has(clientId)) return null;
  const original = room.history.find((h) => h.itemId === historyItemId);
  if (!original) return null;

  if (room.currentTrack) {
    const { itemId, source, trackId, title, thumbnail, addedBy: prevAddedBy, addedAt } = room.currentTrack;
    room.history.unshift({ itemId, source, trackId, title, thumbnail, addedBy: prevAddedBy, addedAt, playedAt: new Date() });
    if (room.history.length > MAX_HISTORY) room.history.length = MAX_HISTORY;
  }

  room.currentTrack = {
    itemId: nanoid(10),
    source: original.source,
    trackId: original.trackId,
    title: original.title,
    thumbnail: original.thumbnail,
    addedBy,
    addedByClientId: clientId,
    addedAt: new Date(),
    votes: [],
  };
  room.playbackState = { ...freshPlaybackState(), isPlaying: true };

  persist(room);
  return room;
}

// SECURITY: only host OR the track owner can remove
export function removeFromQueue(roomId, itemId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const item = room.queue.find((i) => i.itemId === itemId);
  if (!item) return null;

  // Permission: host or the person who added the track
  const isHostUser = room.hostClientIds.has(clientId);
  const isOwner = item.addedByClientId && item.addedByClientId === clientId;
  if (!isHostUser && !isOwner) return "NOT_AUTHORIZED";

  room.queue = room.queue.filter((i) => i.itemId !== itemId);
  persist(room);
  return room;
}

export function voteForTrack(roomId, itemId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const item = room.queue.find((i) => i.itemId === itemId);
  if (!item) return null;

  const idx = item.votes.indexOf(clientId);
  if (idx === -1) item.votes.push(clientId);
  else item.votes.splice(idx, 1);

  sortQueueByVotes(room);
  persist(room);
  return room;
}

// SECURITY: only hosts can skip
export function nextSong(roomId, clientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  // Permission: only hosts may skip
  if (clientId && !room.hostClientIds.has(clientId)) return "NOT_HOST";

  if (room.currentTrack) {
    const { itemId, source, trackId, title, thumbnail, addedBy, addedAt } = room.currentTrack;
    room.history.unshift({ itemId, source, trackId, title, thumbnail, addedBy, addedAt, playedAt: new Date() });
    if (room.history.length > MAX_HISTORY) room.history.length = MAX_HISTORY;
  }

  room.currentTrack = room.queue.shift() ?? null;
  room.playbackState = { ...freshPlaybackState(), isPlaying: !!room.currentTrack };
  persist(room);
  return room;
}

// SECURITY: debounced — only process if 3 s since last track-ended for this room
export function trackEnded(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const now = Date.now();
  if (now - room.lastTrackEndedAt < TRACK_ENDED_DEBOUNCE_MS) {
    return room; // debounce — ignore duplicate
  }
  room.lastTrackEndedAt = now;

  if (room.currentTrack && (room.currentTrack.repeatCount ?? 1) > 1) {
    room.currentTrack.repeatCount -= 1;
    room.playbackState = { ...freshPlaybackState(), isPlaying: true };
    persist(room);
    return room;
  }

  // Advance to next — no clientId check here since track-ended is a natural
  // end-of-playback event, not a user-initiated skip.
  return nextSong(roomId, null);
}

export function sendMessage(roomId, clientId, name, text) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const message = { id: nanoid(10), clientId, name, text, sentAt: Date.now() };
  room.messages.push(message);
  if (room.messages.length > MAX_MESSAGES) room.messages.shift();

  persist(room);
  return message;
}

export function setPlayback(roomId, clientId, { isPlaying, timestamp }) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.hostClientIds.has(clientId)) return null;

  room.playbackState = {
    isPlaying: isPlaying ?? room.playbackState.isPlaying,
    timestamp: typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp >= 0
      ? timestamp
      : room.playbackState.timestamp,
    updatedAt: Date.now(),
  };
  persist(room);
  return room;
}

export function isHost(roomId, clientId) {
  const room = rooms.get(roomId);
  return !!room && room.hostClientIds.has(clientId);
}
