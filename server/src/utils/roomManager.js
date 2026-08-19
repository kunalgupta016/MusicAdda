import { nanoid, customAlphabet } from "nanoid";
import Room from "../models/Room.js";
import { isDbConnected } from "../config/db.js";

const roomIdAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars
const generateRoomId = customAlphabet(roomIdAlphabet, 6);

// In-memory source of truth for active rooms. MongoDB is used only for
// durability (surviving server restarts) — every real-time read/write
// happens against this map so playback stays low-latency.
const rooms = new Map();

function freshPlaybackState() {
  return { isPlaying: false, timestamp: 0, updatedAt: Date.now() };
}

function newRoomState(roomId) {
  return {
    roomId,
    hostClientId: null,
    users: new Map(), // clientId -> { name, socketId, connected }
    queue: [],
    currentTrack: null,
    playbackState: freshPlaybackState(),
    history: [], // most-recently-played first, capped at 50
    messages: [], // chat log, capped at 200
  };
}

// Fire-and-forget persistence — never blocks the real-time path.
function persist(room) {
  if (!isDbConnected()) return;
  Room.findOneAndUpdate(
    { roomId: room.roomId },
    {
      roomId: room.roomId,
      hostClientId: room.hostClientId,
      queue: room.queue,
      currentTrack: room.currentTrack,
      playbackState: room.playbackState,
      history: room.history,
      messages: room.messages,
      lastActiveAt: new Date(),
    },
    { upsert: true }
  ).catch((err) => console.error(`[roomManager] persist failed for ${room.roomId}:`, err.message));
}

// Keeps the queue ordered by votes — most-voted first, ties broken by who
// was added earlier. This is what makes voting actually change play order
// instead of being decorative: nextSong() just takes queue[0], so whichever
// track has the most upvotes plays next, no host approval needed.
function sortQueueByVotes(room) {
  room.queue.sort((a, b) => b.votes.length - a.votes.length || a.addedAt - b.addedAt);
}

export async function createRoom() {
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

// Loads a room into memory (from DB if needed) and returns it, or null if it truly doesn't exist.
async function loadRoom(roomId) {
  if (rooms.has(roomId)) return rooms.get(roomId);

  if (isDbConnected()) {
    const doc = await Room.findOne({ roomId }).lean();
    if (doc) {
      const room = newRoomState(roomId);
      room.hostClientId = doc.hostClientId ?? null;
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
    hostClientId: room.hostClientId,
    users: Array.from(room.users.entries())
      .filter(([, u]) => u.connected)
      .map(([clientId, u]) => ({
        clientId,
        name: u.name,
        isHost: clientId === room.hostClientId,
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

  const hadNoConnectedUsers = Array.from(room.users.values()).every((u) => !u.connected);

  room.users.set(clientId, { name, socketId, connected: true });

  // First connected user becomes host if no host is currently connected.
  const hostStillConnected = room.hostClientId && room.users.get(room.hostClientId)?.connected;
  if (!hostStillConnected) {
    room.hostClientId = clientId;
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
  if (!user || user.socketId !== socketId) return room; // stale/replaced connection

  user.connected = false;

  if (room.hostClientId === clientId) {
    const nextHost = Array.from(room.users.entries()).find(([, u]) => u.connected);
    room.hostClientId = nextHost ? nextHost[0] : null;
  }

  return room;
}

// Only the current host may hand control to someone else — a listener can no
// longer grab it for themselves. If the host disconnects, disconnectSocket()
// already promotes the next connected user automatically.
export function transferControl(roomId, requesterClientId, targetClientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.hostClientId !== requesterClientId) return null; // only the host can transfer
  if (!room.users.get(targetClientId)?.connected) return null; // target must be present

  room.hostClientId = targetClientId;
  persist(room);
  return room;
}

export async function addToQueue(roomId, { source = "youtube", trackId, title, thumbnail, addedBy }) {
  const room = await loadRoom(roomId);
  if (!room) return null;

  const item = {
    itemId: nanoid(10),
    source,
    trackId,
    title,
    thumbnail,
    addedBy,
    addedAt: new Date(),
    votes: [],
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

// Replays a track from history by re-queueing it fresh (new itemId, no
// carried-over votes) — reuses the same addToQueue path so it plays
// immediately if the queue is empty, same as adding any other link.
export async function replayFromHistory(roomId, historyItemId, addedBy) {
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
  });
}

export function removeFromQueue(roomId, itemId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.queue = room.queue.filter((i) => i.itemId !== itemId);
  persist(room);
  return room;
}

// Anyone can vote (toggle) — this is the "democratic" alternative to
// host-controlled ordering: the queue always stays sorted by votes, so
// nextSong() naturally advances to whatever the room upvoted most.
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

export function nextSong(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (room.currentTrack) {
    const { itemId, source, trackId, title, thumbnail, addedBy, addedAt } = room.currentTrack;
    room.history.unshift({ itemId, source, trackId, title, thumbnail, addedBy, addedAt, playedAt: new Date() });
    if (room.history.length > 50) room.history.length = 50;
  }

  room.currentTrack = room.queue.shift() ?? null;
  room.playbackState = { ...freshPlaybackState(), isPlaying: !!room.currentTrack };
  persist(room);
  return room;
}

export function sendMessage(roomId, clientId, name, text) {
  const room = rooms.get(roomId);
  if (!room) return null;

  const message = { id: nanoid(10), clientId, name, text, sentAt: Date.now() };
  room.messages.push(message);
  if (room.messages.length > 200) room.messages.shift();

  persist(room);
  return message;
}

export function setPlayback(roomId, clientId, { isPlaying, timestamp }) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.hostClientId !== clientId) return null; // only host may drive playback

  room.playbackState = {
    isPlaying: isPlaying ?? room.playbackState.isPlaying,
    timestamp: typeof timestamp === "number" ? timestamp : room.playbackState.timestamp,
    updatedAt: Date.now(),
  };
  persist(room);
  return room;
}

export function isHost(roomId, clientId) {
  const room = rooms.get(roomId);
  return !!room && room.hostClientId === clientId;
}
