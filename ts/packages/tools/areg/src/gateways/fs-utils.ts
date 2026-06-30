import { lstat, readlink } from "node:fs/promises";

import { errorCodeFromUnknown, isPathInside } from "@sdl/core/primitives";

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
	return isPathInside(root, candidate);
}

export function isNodeErrorCode(error: unknown, code: string): boolean {
	return errorCodeFromUnknown(error) === code;
}
