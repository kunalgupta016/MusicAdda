import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import { connectDb } from "./config/db.js";
import roomRoutes from "./routes/roomRoutes.js";
import { registerSocketHandlers } from "./sockets/index.js";

const PORT = process.env.PORT || 4000;
// Browsers never send a trailing slash in the Origin header, so strip one
// here in case it sneaks into the env var — otherwise a value like
// "https://example.com/" silently fails to match "https://example.com" and
// every request gets CORS-blocked.
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/rooms", roomRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

registerSocketHandlers(io);

async function start() {
  await connectDb();
  httpServer.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  });
}

start();
