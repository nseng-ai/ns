import { accessSync, constants } from "node:fs";

import { commandSucceeded, type ExecOptions } from "@nseng-ai/foundation/exec";

import { GIT_TIMEOUT_MS } from "./constants.ts";
import type { CommandExecApi, ExtensionContext } from "./types.ts";

export async function resolveRepoRoot(
	pi: CommandExecApi,
	cwd: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const result = await pi.exec(
		"git",
		["rev-parse", "--show-toplevel"],
		execOptions(cwd, GIT_TIMEOUT_MS, signal),
	);
	if (!commandSucceeded(result)) return undefined;
	return result.stdout.trim() || undefined;
}

export async function isWorkingTreeDirty(
	pi: CommandExecApi,
	cwd: string,
	signal?: AbortSignal,
): Promise<boolean> {
	const result = await pi.exec(
		"git",
		["status", "--porcelain=v1"],
		execOptions(cwd, GIT_TIMEOUT_MS, signal),
	);
	if (!commandSucceeded(result)) return true;
	return result.stdout.trim().length > 0;
}
export function execOptions(cwd: string, timeout: number, signal?: AbortSignal): ExecOptions {
	return { cwd, timeout, ...(signal === undefined ? {} : { signal }) };
}

export function pathExists(path: string): boolean {
	try {
		accessSync(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export function notify(
	ctx: ExtensionContext,
	message: string,
	level: "info" | "warning" | "error",
): void {
	ctx.ui?.notify?.(message, level);
}
