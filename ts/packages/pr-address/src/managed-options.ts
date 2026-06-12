export interface ParsedOptions {
	values: Map<string, string>;
}

export type ParseOptionsResult = { type: "ok"; options: ParsedOptions } | { type: "error"; message: string };

export function parseManagedOptions(args: readonly string[], valueOptions: readonly string[]): ParseOptionsResult {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--json-schema") continue;
		if (valueOptions.includes(arg)) {
			const value = args[index + 1];
			if (value === undefined) return { type: "error", message: `${arg} requires a value.` };
			values.set(arg, value);
			index += 1;
			continue;
		}
		return { type: "error", message: `Unknown option for managed pr-address operation: ${arg}` };
	}
	return { type: "ok", options: { values } };
}
