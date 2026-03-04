import mongoose, { Schema } from "mongoose";

const MessageSchema = new Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const ConversationSchema = new Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, default: "New Chat" },
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Conversation =
  mongoose.models.Conversation ||
  mongoose.model("Conversation", ConversationSchema);
