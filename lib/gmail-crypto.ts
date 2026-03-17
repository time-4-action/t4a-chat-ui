import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY env var is not set");
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decrypt(ciphertext: string, iv: string, authTag: string): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
