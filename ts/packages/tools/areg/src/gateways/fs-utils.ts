import { lstat, readlink } from "node:fs/promises";
import path from "node:path";

import type { AregPathState } from "../gateways.ts";

export async function inspectPath(candidate: string): Promise<AregPathState> {
	try {
		const info = await lstat(candidate);
		if (info.isSymbolicLink()) return { type: "symlink", target: await readlink(candidate) };
		if (info.isDirectory()) return { type: "directory" };
		if (info.isFile()) return { type: "file" };
		return { type: "other" };
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
		return { type: "other" };
	}
}

export function isPathAtOrBelow(candidate: string, root: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === "" ||
		(relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative))
	);
}

export function isNodeErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === code
	);
}
