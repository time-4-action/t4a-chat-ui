import mongoose, { Schema } from "mongoose";

const UserPreferenceSchema = new Schema({
  userId: { type: String, required: true, index: true, unique: true },
  personalInfo: {
    name: { type: String, default: "" },
    jobTitle: { type: String, default: "" },
    company: { type: String, default: "" },
    roleDescription: { type: String, default: "" },
  },
  communicationStyle: {
    tone: { type: String, default: "" },
    formality: { type: String, default: "" },
    signatureStyle: { type: String, default: "" },
  },
  emailTemplates: { type: String, default: "" },
  customInstructions: { type: String, default: "" },
  promptCaching: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

export const UserPreference =
  mongoose.models.UserPreference ||
  mongoose.model("UserPreference", UserPreferenceSchema);
