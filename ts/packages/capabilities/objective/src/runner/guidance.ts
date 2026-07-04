import { resolveAtPrefixedValue, type ReadAtPrefixedValueResult } from "./at-prefixed-value.ts";
import type { RunnerTextFileReadResult } from "./context.ts";

export type ResolveGuidanceResult =
	/** Resolved guidance text; `guidance` is omitted when none was requested. */
	| { type: "ok"; guidance?: string }
	| Extract<ReadAtPrefixedValueResult, { type: "unreadable-file" }>;

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
