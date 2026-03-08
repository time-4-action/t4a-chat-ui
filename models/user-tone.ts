import mongoose, { Schema } from "mongoose";

const UserToneSchema = new Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  tags: { type: [String], default: [] },
  examples: { type: String, default: "" },
  customPrompt: { type: String, default: "" },
  characteristics: { type: String, default: "" },
  generatedPrompt: { type: String, default: "" },
  isActive: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const UserTone =
  mongoose.models.UserTone ||
  mongoose.model("UserTone", UserToneSchema);
