// ---------------------------------------------------------------------------
// Study Room Notes — PDF upload/view/delete, backed by GridFS
// ---------------------------------------------------------------------------
// REST, not sockets, because binary file uploads don't fit Socket.io's
// message model well. There's no socket-auth middleware to lean on here, so
// every request's clientId is cross-checked against who's actually a
// connected member of that room (via roomManager) before anything happens.
// ---------------------------------------------------------------------------

import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
import { getRoom, addNote, removeNote, findNote, serializeRoom, MAX_NOTE_SIZE_BYTES } from "../utils/roomManager.js";
import { uploadToGridFS, downloadFromGridFS, deleteFromGridFS } from "../utils/gridfs.js";
import { isDbConnected } from "../config/db.js";
import { validateRoomId, validateClientId, validateItemId, sanitizeText } from "../utils/sanitize.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("notes");
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_NOTE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "application/pdf");
  },
});

// Error handler for multer (handles fileSize limit exceeded, etc.)
const multerErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxSizeMB = Math.round(MAX_NOTE_SIZE_BYTES / (1024 * 1024));
      return res.status(413).json({ 
        error: `File too large. Max size is ${maxSizeMB} MB. Your file exceeds this limit.` 
      });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next(err);
};

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads. Slow down." },
});

function broadcast(req, roomId) {
  const io = req.app.get("io");
  const room = getRoom(roomId);
  if (io && room) {
    io.to(roomId).emit("sync-state", serializeRoom(room));
  }
}

/** A request only counts as "from this room" if its clientId is actually a connected member. */
function requireRoomMember(roomId, clientId) {
  const room = getRoom(roomId);
  if (!room) return null;
  const user = room.users.get(clientId);
  if (!user?.connected) return null;
  return { room, user };
}

router.post("/:roomId/notes", uploadLimiter, upload.single("file"), multerErrorHandler, async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ error: "Notes need a database connection, which isn't configured." });
    }

    const roomId = validateRoomId(req.params.roomId);
    const clientId = validateClientId(req.body?.clientId);
    if (!roomId || !clientId) return res.status(400).json({ error: "Invalid roomId or clientId" });

    const membership = requireRoomMember(roomId, clientId);
    if (!membership) return res.status(403).json({ error: "You're not a connected member of this room" });

    if (!req.file) return res.status(400).json({ error: "No PDF file provided (or it wasn't a PDF)" });

    const room = membership.room;
    if (room.roomType !== "study") {
      return res.status(400).json({ error: "Notes are only available in study rooms" });
    }

    const filename = sanitizeText(req.file.originalname, 200) || "note.pdf";
    const fileId = await uploadToGridFS(req.file.buffer, filename, "application/pdf");

    const note = {
      noteId: nanoid(10),
      fileId,
      filename,
      sizeBytes: req.file.size,
      uploadedBy: membership.user.name,
      uploadedByClientId: clientId,
      uploadedAt: new Date(),
    };

    const updated = addNote(roomId, note);
    if (updated === "NOTES_FULL") {
      await deleteFromGridFS(fileId);
      return res.status(400).json({ error: "This room already has the max number of notes (20)" });
    }
    if (!updated) {
      await deleteFromGridFS(fileId);
      return res.status(404).json({ error: "Room not found" });
    }

    broadcast(req, roomId);
    res.status(201).json({ ok: true, note: { noteId: note.noteId, filename: note.filename } });
  } catch (err) {
    log.error("upload failed:", err.message);
    res.status(500).json({ error: "Upload failed" });
  }
});

router.get("/:roomId/notes/:noteId", async (req, res) => {
  try {
    const roomId = validateRoomId(req.params.roomId);
    const noteId = validateItemId(req.params.noteId);
    if (!roomId || !noteId) return res.status(400).json({ error: "Invalid roomId or noteId" });

    const note = findNote(roomId, noteId);
    if (!note) return res.status(404).json({ error: "Note not found" });

    const stream = downloadFromGridFS(note.fileId);
    if (!stream) return res.status(503).json({ error: "File storage unavailable" });

    res.setHeader("Content-Type", "application/pdf");
    // inline (not attachment): opens the PDF in-browser, matching the
    // "read at your own pace" design rather than forcing a download.
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(note.filename)}"`);
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch (err) {
    log.error("download failed:", err.message);
    res.status(500).json({ error: "Download failed" });
  }
});

router.delete("/:roomId/notes/:noteId", async (req, res) => {
  try {
    const roomId = validateRoomId(req.params.roomId);
    const noteId = validateItemId(req.params.noteId);
    const clientId = validateClientId(req.body?.clientId ?? req.query?.clientId);
    if (!roomId || !noteId || !clientId) return res.status(400).json({ error: "Invalid request" });

    const result = removeNote(roomId, noteId, clientId);
    if (result === "NOT_AUTHORIZED") {
      return res.status(403).json({ error: "Only the host or the person who uploaded it can remove it" });
    }
    if (!result) return res.status(404).json({ error: "Note not found" });

    await deleteFromGridFS(result.deletedFileId);
    broadcast(req, roomId);
    res.json({ ok: true });
  } catch (err) {
    log.error("delete failed:", err.message);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
