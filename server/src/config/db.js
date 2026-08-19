import mongoose from "mongoose";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI not set — running without persistence. Rooms will only live in memory.");
    return null;
  }

  try {
    await mongoose.connect(uri);
    console.log("[db] Connected to MongoDB");
    return mongoose.connection;
  } catch (err) {
    console.error("[db] Failed to connect to MongoDB:", err.message);
    console.warn("[db] Continuing without persistence — rooms will only live in memory.");
    return null;
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
