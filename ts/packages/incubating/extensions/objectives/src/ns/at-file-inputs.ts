/**
 * Bare `@file` JSON input contract shared by the Objective Runner publication
 * commands: both `publication-bind` and `publication-publish` accept typed
 * JSON payloads only as bare `@file` paths, resolved against the command cwd.
 */
import { resolve } from "node:path";

import { usageError, type ClinkrUsageErrorExit } from "@nseng-ai/clinkr";
import { z } from "zod";

export const atFileSchema = z
	.string()
	.regex(/^@.+/u, "Expected a bare @file input.")
	.describe("Bare @file path containing the typed JSON input.");

export const absoluteAtFileSchema = z
	.string()
	.regex(/^@\//u, "Expected a bare @file input with an absolute path.")
	.describe("Absolute bare @file path for the parent-held authorization artifact.");

export async function readJsonInput(
	ctx: {
		cwd: string;
		readTextFile(
			path: string,
		): Promise<{ ok: true; content: string } | { ok: false; message: string }>;
	},
	input: string,
	argument: string,
): Promise<
	| { ok: true; value: unknown }
	| { ok: false; exit: ClinkrUsageErrorExit<{ readonly argument: string }> }
> {
	const path = absoluteAtPath(ctx.cwd, input);
	const read = await ctx.readTextFile(path);
	if (!read.ok) {
		return {
			ok: false,
			exit: usageError(`Could not read @file input ${path}: ${read.message}`, { argument }),
		};
	}
	const parsed = parseJson(read.content);
	if (!parsed.ok) {
		return {
			ok: false,
			exit: usageError(`@file input ${path} is not valid JSON.`, { argument }),
		};
	}
	return parsed;
}

export function absoluteAtPath(cwd: string, input: string): string {
	return resolve(cwd, input.slice(1));
}

export function parseJson(content: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(content) as unknown };
	} catch {
		return { ok: false };
	}
}
