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
    hostClientIds: new Set(), // multiple people can hold host at once
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
      hostClientIds: Array.from(room.hostClientIds),
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

function hasConnectedHost(room) {
  return Array.from(room.hostClientIds).some((id) => room.users.get(id)?.connected);
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

  const hadNoConnectedUsers = Array.from(room.users.values()).every((u) => !u.connected);

  room.users.set(clientId, { name, socketId, connected: true });

  // First connected user becomes host if no host is currently connected.
  // Doesn't replace any other host — this only fires when the room would
  // otherwise be host-less.
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
  if (!user || user.socketId !== socketId) return room; // stale/replaced connection

  user.connected = false;
  room.hostClientIds.delete(clientId);

  // Only fall back to auto-promoting someone if that was the last host
  // standing — with multiple hosts, one leaving shouldn't demote anyone
  // still connected.
  if (!hasConnectedHost(room)) {
    const nextUser = Array.from(room.users.entries()).find(([, u]) => u.connected);
    if (nextUser) room.hostClientIds.add(nextUser[0]);
  }

  return room;
}

// Any existing host can grant host status to someone else — this adds them
// alongside the current hosts rather than replacing anyone, so a room can
// have several hosts at once. A listener can't grant it to themselves.
export function addHost(roomId, requesterClientId, targetClientId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.hostClientIds.has(requesterClientId)) return null; // only a host can promote someone
  if (!room.users.get(targetClientId)?.connected) return null; // target must be present

  room.hostClientIds.add(targetClientId);
  persist(room);
  return room;
}

const MAX_REPEAT = 10;

// If this exact track is already current or already queued, don't add a
// second copy — bump its repeat count instead. This is what lets someone
// "queue the same song again" actually mean "play it again" rather than
// leaving two identical rows sitting in the queue.
export async function addToQueue(roomId, { source = "youtube", trackId, title, thumbnail, addedBy }) {
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

  const item = {
    itemId: nanoid(10),
    source,
    trackId,
    title,
    thumbnail,
    addedBy,
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

// Lets anyone directly set how many times a track should repeat, cycling
// 1 → 2 → … → MAX_REPEAT → back to 1, without needing to re-paste the link.
export function incrementRepeat(roomId, itemId) {
  const room = rooms.get(roomId);
  if (!room) return null;

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

// Adds a past track back into the queue (normal add-to-queue semantics —
// joins the vote-sorted queue, or plays immediately if nothing's current).
export async function queueFromHistory(roomId, historyItemId, addedBy) {
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

// Plays a past track right now, interrupting whatever's currently playing
// (which itself gets logged to history so nothing's lost). Distinct from
// queueFromHistory: this jumps straight to playing instead of waiting in
// the queue — same permission tier as Skip, so only a host can do it.
export function replayNow(roomId, clientId, historyItemId, addedBy) {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (!room.hostClientIds.has(clientId)) return null;
  const original = room.history.find((h) => h.itemId === historyItemId);
  if (!original) return null;

  if (room.currentTrack) {
    const { itemId, source, trackId, title, thumbnail, addedBy: prevAddedBy, addedAt } = room.currentTrack;
    room.history.unshift({ itemId, source, trackId, title, thumbnail, addedBy: prevAddedBy, addedAt, playedAt: new Date() });
    if (room.history.length > 50) room.history.length = 50;
  }

  room.currentTrack = {
    itemId: nanoid(10),
    source: original.source,
    trackId: original.trackId,
    title: original.title,
    thumbnail: original.thumbnail,
    addedBy,
    addedAt: new Date(),
    votes: [],
  };
  room.playbackState = { ...freshPlaybackState(), isPlaying: true };

  persist(room);
  return room;
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

// Explicit "Skip" — always truly advances to the next track, even if the
// current one still has repeats left. Skip means skip.
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

// Called when a track finishes naturally (not skipped). If it still has
// repeats left, it plays again in place instead of advancing — only once
// its repeats are used up does the queue move on, same as nextSong().
export function trackEnded(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (room.currentTrack && (room.currentTrack.repeatCount ?? 1) > 1) {
    room.currentTrack.repeatCount -= 1;
    room.playbackState = { ...freshPlaybackState(), isPlaying: true };
    persist(room);
    return room;
  }

  return nextSong(roomId);
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
  if (!room.hostClientIds.has(clientId)) return null; // only a host may drive playback

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
  return !!room && room.hostClientIds.has(clientId);
}
