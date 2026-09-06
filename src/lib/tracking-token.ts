import { createHash, randomBytes } from "node:crypto";

const TRACKING_TOKEN_BYTES = 32;

export function createTrackingToken(): string {
  return randomBytes(TRACKING_TOKEN_BYTES).toString("base64url");
}

export function hashTrackingToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
