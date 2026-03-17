import mongoose, { Schema } from "mongoose";

const MessageFileSchema = new Schema({
  mediaType: { type: String, required: true },
  filename: { type: String, default: "" },
  url: { type: String, default: "" }, // data URL for images; empty for PDFs (too large)
}, { _id: false });

const MessageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  files: { type: [MessageFileSchema], default: [] },
  // Full UIMessage parts JSON — enables proper history reconstruction (email cards, tool results)
  parts: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
});

const ConversationSchema = new Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, default: "New Chat" },
  messages: [MessageSchema],
  model: { type: String, default: "claude-sonnet-4-6" },
  totalCostUsd: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", ConversationSchema);
