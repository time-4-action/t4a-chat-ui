import mongoose, { Schema } from "mongoose";

// One document per userId — admin sets the cap, chat route enforces it.
const UserLimitSchema = new Schema({
  userId:          { type: String, required: true, unique: true },
  limitUsd:        { type: Number, required: true },           // spending cap in USD
  period:          { type: String, enum: ["monthly", "weekly", "daily", "total"], required: true },
  currentSpendUsd: { type: Number, default: 0 },              // accumulator for current window
  periodStart:     { type: Date,   required: true },           // when the current window started
  updatedAt:       { type: Date,   default: Date.now },
});

export const UserLimit =
  mongoose.models.UserLimit ||
  mongoose.model("UserLimit", UserLimitSchema);
