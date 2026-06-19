import { createHash } from "node:crypto";

export function sha256HexPrefix(value: string, length: number): string {
	return createHash("sha256").update(value, "utf-8").digest("hex").slice(0, length);
}
