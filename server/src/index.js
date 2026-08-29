// ---------------------------------------------------------------------------
// MusicAdda Server — Security-Hardened Entry Point
// ---------------------------------------------------------------------------

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";

import { validateEnv } from "./utils/envValidator.js";
import { connectDb } from "./config/db.js";
import roomRoutes from "./routes/roomRoutes.js";
import notesRoutes from "./routes/notesRoutes.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("server");

// ---------------------------------------------------------------------------
// 1. Environment validation — crash early on misconfiguration
// ---------------------------------------------------------------------------
validateEnv();

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = (process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// 2. Express setup
// ---------------------------------------------------------------------------
const app = express();

// ---------------------------------------------------------------------------
// 3. SECURITY: Helmet — sets ~15 HTTP security headers in one line
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],    // YouTube iframe API needs inline
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://img.youtube.com", "https://i.ytimg.com", "https://*.ytimg.com"],
        frameSrc: ["https://www.youtube.com", "https://youtube.com"],
        connectSrc: ["'self'", CLIENT_ORIGIN, "wss:", "ws:"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // Prevent clickjacking — this is a SPA, never meant to be embedded
    frameguard: { action: "deny" },
    // HSTS: force HTTPS for 1 year including subdomains
    hsts: { maxAge: 31536000, includeSubDomains: true },
    // Prevent MIME-type sniffing
    noSniff: true,
    // Referrer policy for privacy
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// ---------------------------------------------------------------------------
// 4. CORS
// ---------------------------------------------------------------------------
app.use(cors({ origin: CLIENT_ORIGIN }));

// ---------------------------------------------------------------------------
// 5. SECURITY: Body size limit — prevent oversized payloads
// ---------------------------------------------------------------------------
app.use(express.json({ limit: "10kb" }));

// ---------------------------------------------------------------------------
// 6. SECURITY: Global rate limit — 100 requests per minute per IP
// ---------------------------------------------------------------------------
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
  })
);

// ---------------------------------------------------------------------------
// 7. Routes
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/rooms", roomRoutes);
app.use("/api/rooms", notesRoutes);

// ---------------------------------------------------------------------------
// 8. SECURITY: Global error handler — never leak stack traces
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  log.error("Unhandled Express error:", err.message);
  res.status(err.status || 500).json({ error: "Internal server error" });
});

// ---------------------------------------------------------------------------
// 9. HTTP + Socket.io server
// ---------------------------------------------------------------------------
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
  // SECURITY: limit max payload size per socket message (10 KB)
  maxHttpBufferSize: 1e4,
});

registerSocketHandlers(io);
// Lets the REST notes routes broadcast a sync-state after an upload/delete,
// same as every socket handler already does.
app.set("io", io);

// ---------------------------------------------------------------------------
// 10. Start
// ---------------------------------------------------------------------------
async function start() {
  await connectDb();
  httpServer.listen(PORT, () => {
    log.info(`Listening on http://localhost:${PORT}`);
  });
}

start();

// ---------------------------------------------------------------------------
// 11. SECURITY: Graceful shutdown
// ---------------------------------------------------------------------------
// On SIGTERM / SIGINT (deploy, Ctrl-C, container stop):
//   1. Stop accepting new connections
//   2. Close all socket connections gracefully
//   3. Wait for pending MongoDB writes to flush
//   4. Exit cleanly
// ---------------------------------------------------------------------------
function gracefulShutdown(signal) {
  log.info(`${signal} received — starting graceful shutdown`);

  // Stop accepting new HTTP connections
  httpServer.close(() => {
    log.info("HTTP server closed");
  });

  // Close all active socket connections
  io.close(() => {
    log.info("Socket.io server closed");
  });

  // Give pending MongoDB writes a moment to flush, then exit
  setTimeout(async () => {
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        log.info("MongoDB connection closed");
      }
    } catch (err) {
      log.error("Error closing MongoDB:", err.message);
    }
    process.exit(0);
  }, 2000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
