import { resolve } from "node:path";

import type { RunnerTextFileReadResult } from "./context.ts";

export type ParsedAtPrefixedValue =
	| { type: "inline"; content: string }
	| { type: "file"; path: string };

export type ReadAtPrefixedValueResult =
	| { type: "ok"; content: string }
	| { type: "unreadable-file"; path: string; message: string };

export interface ParseAtPrefixedValueOptions {
	cwd: string;
	value: string;
}

export interface ResolveAtPrefixedValueOptions extends ParseAtPrefixedValueOptions {
	readTextFile(path: string): Promise<RunnerTextFileReadResult>;
}

/** `@`-prefixed values are file paths resolved against cwd; otherwise inline. */
export function parseAtPrefixedValue(options: ParseAtPrefixedValueOptions): ParsedAtPrefixedValue {
	if (!options.value.startsWith("@")) return { type: "inline", content: options.value };
	return { type: "file", path: resolve(options.cwd, options.value.slice(1)) };
}

export async function readAtPrefixedValue(
	source: ParsedAtPrefixedValue,
	readTextFile: (path: string) => Promise<RunnerTextFileReadResult>,
): Promise<ReadAtPrefixedValueResult> {
	if (source.type === "inline") return { type: "ok", content: source.content };
	const read = await readTextFile(source.path);
	if (read.type === "error") {
		return { type: "unreadable-file", path: source.path, message: read.message };
	}
	return { type: "ok", content: read.content };
}

export async function resolveAtPrefixedValue(
	options: ResolveAtPrefixedValueOptions,
): Promise<ReadAtPrefixedValueResult> {
	return readAtPrefixedValue(parseAtPrefixedValue(options), options.readTextFile);
}
