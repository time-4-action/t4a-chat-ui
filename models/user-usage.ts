import mongoose, { Schema } from "mongoose";

// One document per (userId, modelId) pair — accumulates permanently, unaffected by conversation deletes.
const UserUsageSchema = new Schema({
  userId:            { type: String, required: true },
  modelId:           { type: String, required: true },
  conversationCount:    { type: Number, default: 0 },
  inputTokens:          { type: Number, default: 0 },
  outputTokens:         { type: Number, default: 0 },
  cacheReadTokens:      { type: Number, default: 0 },
  cacheCreationTokens:  { type: Number, default: 0 },
  totalCostUsd:         { type: Number, default: 0 },
});

UserUsageSchema.index({ userId: 1, modelId: 1 }, { unique: true });

export const UserUsage =
  mongoose.models.UserUsage ||
  mongoose.model("UserUsage", UserUsageSchema);
