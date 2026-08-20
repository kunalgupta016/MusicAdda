import mongoose from "mongoose";

const QueueItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    source: { type: String, enum: ["youtube"], default: "youtube" },
    trackId: { type: String, required: true },
    title: { type: String, default: "Untitled" },
    thumbnail: { type: String, default: "" },
    addedBy: { type: String, default: "Unknown" },
    addedAt: { type: Date, default: Date.now },
    votes: { type: [String], default: [] },
    repeatCount: { type: Number, default: 1 },
  },
  { _id: false }
);

const HistoryItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    source: { type: String, enum: ["youtube"], default: "youtube" },
    trackId: { type: String, required: true },
    title: { type: String, default: "Untitled" },
    thumbnail: { type: String, default: "" },
    addedBy: { type: String, default: "Unknown" },
    addedAt: { type: Date, default: Date.now },
    playedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    clientId: { type: String, required: true },
    name: { type: String, default: "Unknown" },
    text: { type: String, required: true },
    sentAt: { type: Number, required: true },
  },
  { _id: false }
);

const PlaybackStateSchema = new mongoose.Schema(
  {
    isPlaying: { type: Boolean, default: false },
    timestamp: { type: Number, default: 0 },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  hostClientIds: { type: [String], default: [] },
  queue: { type: [QueueItemSchema], default: [] },
  currentTrack: { type: QueueItemSchema, default: null },
  playbackState: { type: PlaybackStateSchema, default: () => ({}) },
  history: { type: [HistoryItemSchema], default: [] },
  messages: { type: [MessageSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
});

export default mongoose.model("Room", RoomSchema);
