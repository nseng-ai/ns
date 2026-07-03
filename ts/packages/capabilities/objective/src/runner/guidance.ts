import { resolve } from "node:path";

import type { RunnerTextFileReadResult } from "./context.ts";

export type ResolveAtPrefixedValueResult =
	| { type: "ok"; content: string }
	| { type: "unreadable-file"; path: string; message: string };

export interface ResolveAtPrefixedValueOptions {
	cwd: string;
	value: string;
	readTextFile(path: string): Promise<RunnerTextFileReadResult>;
}

export type ResolveGuidanceResult =
	/** Resolved guidance text; `guidance` is omitted when none was requested. */
	{ type: "ok"; guidance?: string } | { type: "unreadable-file"; path: string; message: string };

export interface ResolveGuidanceOptions {
	cwd: string;
	guidance: string | undefined;
	readTextFile(path: string): Promise<RunnerTextFileReadResult>;
}

export interface RunnerUsageProblem {
	message: string;
	argument: string;
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
	const resolved = await resolveAtPrefixedValue({
		cwd: options.cwd,
		value: options.guidance,
		readTextFile: options.readTextFile,
	});
	if (resolved.type === "unreadable-file") return resolved;
	return { type: "ok", guidance: resolved.content };
}

export function guidanceUsageProblem(
	result: Extract<ResolveGuidanceResult, { type: "unreadable-file" }>,
): RunnerUsageProblem {
	return {
		message: `Could not read guidance file ${result.path}: ${result.message}`,
		argument: "guidance",
	};
}

/** `@`-prefixed values are file paths resolved against cwd; otherwise inline. */
export async function resolveAtPrefixedValue(
	options: ResolveAtPrefixedValueOptions,
): Promise<ResolveAtPrefixedValueResult> {
	if (!options.value.startsWith("@")) return { type: "ok", content: options.value };
	const path = resolve(options.cwd, options.value.slice(1));
	const read = await options.readTextFile(path);
	if (read.type === "error") return { type: "unreadable-file", path, message: read.message };
	return { type: "ok", content: read.content };
}
