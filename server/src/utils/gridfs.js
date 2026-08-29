// ---------------------------------------------------------------------------
// GridFS — stores uploaded PDFs directly in the existing MongoDB Atlas
// cluster, so study rooms don't need a separate file-storage service. Only
// usable when Mongo is actually connected; the notes feature is unavailable
// in memory-only mode (there's nowhere durable to put the file bytes).
// ---------------------------------------------------------------------------

import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

let bucket = null;

function getBucket() {
  if (mongoose.connection.readyState !== 1) return null;
  if (!bucket) {
    bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "notes" });
  }
  return bucket;
}

export function uploadToGridFS(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const gfs = getBucket();
    if (!gfs) return reject(new Error("GridFS unavailable — no database connection"));

    const uploadStream = gfs.openUploadStream(filename, { contentType });
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

export function downloadFromGridFS(fileId) {
  const gfs = getBucket();
  if (!gfs) return null;
  return gfs.openDownloadStream(new mongoose.Types.ObjectId(fileId));
}

export async function deleteFromGridFS(fileId) {
  const gfs = getBucket();
  if (!gfs) return;
  try {
    await gfs.delete(new mongoose.Types.ObjectId(fileId));
  } catch {
    // Already gone or never existed — nothing more to do.
  }
}
