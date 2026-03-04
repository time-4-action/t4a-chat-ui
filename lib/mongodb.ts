import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;
const cached = (global as any).mongoose || { conn: null, promise: null };
(global as any).mongoose = cached;

export async function connectDB() {
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(MONGODB_URI);
  cached.conn = await cached.promise;
  return cached.conn;
}
