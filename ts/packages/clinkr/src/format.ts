import type { ClinkrFormat } from "./emit.ts";

export function clinkrFormatFromOption(requestedFormat: unknown): ClinkrFormat {
	if (requestedFormat === "json") return "json";
	if (requestedFormat === "markdown" || requestedFormat === "md") return "markdown";
	return "human";
}

export function clinkrFormatFromArgs(args: readonly string[]): ClinkrFormat {
	let format: ClinkrFormat = "human";
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		if (arg.startsWith("--format=")) format = clinkrFormatFromOption(arg.slice("--format=".length));
		if (arg === "--format") format = clinkrFormatFromOption(args[index + 1]);
	}
	return format;
}

export function isClinkrHumanOutputInvocation(args: readonly string[]): boolean {
	if (args.includes("--json-schema")) return false;
	return clinkrFormatFromArgs(args) === "human";
}
