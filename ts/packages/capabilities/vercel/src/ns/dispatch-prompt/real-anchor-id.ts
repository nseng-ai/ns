import { randomBytes } from "node:crypto";

/** Eight hex characters of randomness for anchor branch uniqueness. */
export function generateRealAnchorId(): string {
	return randomBytes(4).toString("hex");
}
