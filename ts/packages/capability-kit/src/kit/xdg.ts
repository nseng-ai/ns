import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export {
	requireSdlStatePath,
	requireXdgPath,
	resolvePathOverride,
	resolveSdlXdgPath,
	resolveXdgHome,
	type XdgDirectoryKind,
	type XdgPathError,
	type XdgPathOptions,
} from "@ns/core/xdg-path";

export async function ensurePrivateDirectory(path: string): Promise<void> {
	await mkdir(path, { recursive: true, mode: 0o700 });
}

export async function ensurePrivateParentDirectory(filePath: string): Promise<void> {
	await ensurePrivateDirectory(dirname(filePath));
}

export function ensurePrivateDirectorySync(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
}

export function ensurePrivateParentDirectorySync(filePath: string): void {
	ensurePrivateDirectorySync(dirname(filePath));
}
