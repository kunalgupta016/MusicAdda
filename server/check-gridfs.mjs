import "dotenv/config";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI);
const filesColl = mongoose.connection.db.collection("notes.files");
const files = await filesColl.find({ filename: "orphan-test.pdf" }).toArray();
console.log(JSON.stringify(files.map((f) => ({ id: f._id.toString(), filename: f.filename, length: f.length }))));
await mongoose.disconnect();
