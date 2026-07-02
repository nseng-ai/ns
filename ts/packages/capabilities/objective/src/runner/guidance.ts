import { resolve } from "node:path";

import type { RunnerTextFileReadResult } from "./context.ts";

export type ResolveGuidanceResult =
	/** Resolved guidance text; `guidance` is omitted when none was requested. */
	{ type: "ok"; guidance?: string } | { type: "unreadable-file"; path: string; message: string };

export interface ResolveGuidanceOptions {
	cwd: string;
	guidance: string | undefined;
	readTextFile(path: string): Promise<RunnerTextFileReadResult>;
}

/**
 * Resolves a `--guidance` flag value into the text handed to the child.
 *
 * A value starting with `@` is always a file path: the `@` is stripped and the
 * remainder resolved against `cwd`; an unreadable file is an errors-as-values
 * variant the command maps to a usage error (exit 2) before anything is
 * dispatched. Any other value is inline guidance text, passed verbatim.
 */
export async function resolveGuidance(
	options: ResolveGuidanceOptions,
): Promise<ResolveGuidanceResult> {
	if (options.guidance === undefined) return { type: "ok" };
	if (!options.guidance.startsWith("@")) return { type: "ok", guidance: options.guidance };
	const path = resolve(options.cwd, options.guidance.slice(1));
	const read = await options.readTextFile(path);
	if (read.type === "error") return { type: "unreadable-file", path, message: read.message };
	return { type: "ok", guidance: read.content };
}
