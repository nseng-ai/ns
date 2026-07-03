import { sha256Digest } from "@ji/core/primitives";

export function sha256HexPrefix(value: string, length: number): string {
	return sha256Digest(value).slice(0, length);
}
