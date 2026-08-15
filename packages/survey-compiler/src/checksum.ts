import { createHash } from "node:crypto";
import { canonicalSerialize } from "./canonical-serialization";

export const createSha256Checksum = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

export const createCanonicalChecksum = (value: unknown): string =>
  createSha256Checksum(canonicalSerialize(value));
