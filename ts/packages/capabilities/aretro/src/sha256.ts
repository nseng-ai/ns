import { sha256Digest } from "@ns/core/primitives";

export function sha256HexPrefix(value: string, length: number): string {
	return sha256Digest(value).slice(0, length);
}
