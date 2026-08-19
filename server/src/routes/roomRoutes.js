import { Router } from "express";
import { createRoom, roomExists } from "../utils/roomManager.js";

const router = Router();

router.post("/", async (_req, res) => {
  const roomId = await createRoom();
  res.status(201).json({ roomId });
});

router.get("/:roomId", async (req, res) => {
  const exists = await roomExists(req.params.roomId);
  if (!exists) return res.status(404).json({ error: "Room not found" });
  res.json({ roomId: req.params.roomId });
});

export default router;
