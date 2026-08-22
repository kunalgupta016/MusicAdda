import mongoose from "mongoose";
import { createLogger } from "../utils/logger.js";

const log = createLogger("db");

// -------------------------------------------------------------------------
// SECURITY: Enable Mongoose's built-in query sanitization so that objects
// containing MongoDB operator keys ($gt, $ne, $regex …) passed as filter
// arguments are automatically stripped. This is a defence-in-depth layer on
// top of the manual input validation in sanitize.js.
// -------------------------------------------------------------------------
mongoose.set("sanitizeFilter", true);

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    log.warn("MONGODB_URI not set — running without persistence. Rooms will only live in memory.");
    return null;
  }

  try {
    await mongoose.connect(uri);
    log.info("Connected to MongoDB");
    return mongoose.connection;
  } catch (err) {
    log.error("Failed to connect to MongoDB:", err.message);
    log.warn("Continuing without persistence — rooms will only live in memory.");
    return null;
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
