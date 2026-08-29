import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createRoom, roomExists } from "../utils/roomManager.js";
import { validateRoomId } from "../utils/sanitize.js";

const router = Router();

// ---------------------------------------------------------------------------
// SECURITY: Per-route rate limiting
// ---------------------------------------------------------------------------

const createRoomLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 minute
  max: 5,                   // max 5 room creations per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many rooms created. Try again in a minute." },
});

const checkRoomLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.post("/", createRoomLimiter, async (req, res) => {
  const roomType = req.body?.roomType === "study" ? "study" : "music";
  const roomId = await createRoom(roomType);
  if (!roomId) {
    return res.status(503).json({ error: "Server at room capacity. Try again later." });
  }
  res.status(201).json({ roomId, roomType });
});

router.get("/:roomId", checkRoomLimiter, async (req, res) => {
  // SECURITY: validate roomId format before hitting the DB
  const roomId = validateRoomId(req.params.roomId);
  if (!roomId) return res.status(400).json({ error: "Invalid room code" });

  const exists = await roomExists(roomId);
  if (!exists) return res.status(404).json({ error: "Room not found" });
  res.json({ roomId });
});

export default router;
