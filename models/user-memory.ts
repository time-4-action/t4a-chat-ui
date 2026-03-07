import mongoose, { Schema } from "mongoose";

const UserMemorySchema = new Schema({
  userId: { type: String, required: true, unique: true, index: true },
  workContext: { type: String, default: "" },
  personalContext: { type: String, default: "" },
  topOfMind: { type: String, default: "" },
  recentActivity: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now },
});

export const UserMemory =
  mongoose.models.UserMemory ||
  mongoose.model("UserMemory", UserMemorySchema);
