import mongoose, { Schema } from "mongoose";

// Stores per-user encrypted Gmail OAuth tokens.
// refresh_token is AES-256-GCM encrypted before storage.
// iv and authTag are stored alongside the ciphertext for decryption.
const UserGmailSchema = new Schema({
  userId: { type: String, required: true, index: true, unique: true },
  // Encrypted refresh token fields
  encryptedRefreshToken: { type: String, required: true },
  iv: { type: String, required: true },           // hex-encoded 12-byte IV
  authTag: { type: String, required: true },      // hex-encoded 16-byte GCM auth tag
  // Google account info (non-sensitive, stored plaintext)
  googleEmail: { type: String, default: "" },
  connectedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const UserGmail =
  mongoose.models.UserGmail || mongoose.model("UserGmail", UserGmailSchema);
