export const CLINKR_APP_OUTPUT_FORMATS = ["human", "json", "md"] as const;

export type OutputFormat = (typeof CLINKR_APP_OUTPUT_FORMATS)[number];

/** Resolve the framework-selected output format with the same grammar used by app execution. */
export function resolveClinkrOutputFormat(argv: readonly string[]): OutputFormat {
	const parsed = parseGlobalFlags(argv);
	return parsed.ok ? parsed.flags.format : parsed.format;
}

function isOutputFormat(value: string | undefined): value is OutputFormat {
	return value !== undefined && CLINKR_APP_OUTPUT_FORMATS.some((format) => format === value);
}

const FRAMEWORK_ARGUMENT = {
	endOfOptions: "--",
	format: "--format",
	formatPrefix: "--format=",
	help: "--help",
	helpShort: "-h",
	inputJson: "--input-json",
	jsonSchema: "--json-schema",
	runtime: "--runtime",
	version: "--version",
	versionShort: "-V",
} as const;

export interface GlobalFlags {
	readonly format: OutputFormat;
	readonly help: boolean;
	readonly jsonSchema: boolean;
	readonly inputJson: boolean;
	/**
	 * argv with every global flag (and `--format` value) removed. Everything
	 * from the first top-level `--` onward is passed through verbatim.
	 */
	readonly rest: readonly string[];
}

export type GlobalFlagsResult =
	| { readonly ok: true; readonly flags: GlobalFlags }
	| {
			readonly ok: false;
			readonly help: boolean;
			readonly format: OutputFormat;
			readonly message: string;
	  };

export type RootBuiltIn = "version" | "runtime";

/** Shared vocabulary check used while routing around framework-owned arguments. */
export function frameworkRoutingWidth(argv: readonly string[], index: number): 0 | 1 | 2 {
	const argument = argv[index];
	if (
		argument === FRAMEWORK_ARGUMENT.help ||
		argument === FRAMEWORK_ARGUMENT.helpShort ||
		argument === FRAMEWORK_ARGUMENT.inputJson ||
		argument === FRAMEWORK_ARGUMENT.jsonSchema ||
		argument?.startsWith(FRAMEWORK_ARGUMENT.formatPrefix) === true
	) {
		return 1;
	}
	if (argument === FRAMEWORK_ARGUMENT.format) return argv[index + 1] === undefined ? 1 : 2;
	return 0;
}

/** Root-only built-ins win before the first route token, but never after `--`. */
export function findRootBuiltIn(argv: readonly string[]): RootBuiltIn | undefined {
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === undefined || argument === FRAMEWORK_ARGUMENT.endOfOptions) return undefined;
		if (argument === FRAMEWORK_ARGUMENT.version || argument === FRAMEWORK_ARGUMENT.versionShort) {
			return "version";
		}
		if (argument === FRAMEWORK_ARGUMENT.runtime) return "runtime";
		const width = frameworkRoutingWidth(argv, index);
		if (width > 0) {
			index += width - 1;
			continue;
		}
		if (!argument.startsWith("-")) return undefined;
	}
	return undefined;
}

export function hasUnescapedHelp(argv: readonly string[]): boolean {
	for (const argument of argv) {
		if (argument === FRAMEWORK_ARGUMENT.endOfOptions) return false;
		if (argument === FRAMEWORK_ARGUMENT.help || argument === FRAMEWORK_ARGUMENT.helpShort)
			return true;
	}
	return false;
}

/**
 * Single owner of the structured global-argument grammar. A bare `--`
 * terminates scanning and is retained with the raw tail for Commander.
 */
export function parseGlobalFlags(argv: readonly string[]): GlobalFlagsResult {
	const formatValues: string[] = [];
	const rest: string[] = [];
	let help = false;
	let jsonSchema = false;
	let inputJsonCount = 0;
	let missingFormatValue = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === undefined) continue;
		if (argument === FRAMEWORK_ARGUMENT.endOfOptions) {
			rest.push(...argv.slice(index));
			break;
		}
		if (argument === FRAMEWORK_ARGUMENT.help || argument === FRAMEWORK_ARGUMENT.helpShort) {
			help = true;
		} else if (argument === FRAMEWORK_ARGUMENT.jsonSchema) {
			jsonSchema = true;
		} else if (argument === FRAMEWORK_ARGUMENT.inputJson) {
			inputJsonCount += 1;
		} else if (argument === FRAMEWORK_ARGUMENT.format) {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) missingFormatValue = true;
			else {
				formatValues.push(value);
				index += 1;
			}
		} else if (argument.startsWith(FRAMEWORK_ARGUMENT.formatPrefix)) {
			formatValues.push(argument.slice(FRAMEWORK_ARGUMENT.formatPrefix.length));
		} else {
			rest.push(argument);
		}
	}
	const formatValue = formatValues.length === 1 ? formatValues[0] : undefined;
	const format = isOutputFormat(formatValue) ? formatValue : undefined;
	let message: string | undefined;
	if (inputJsonCount > 1) message = "repeated --input-json";
	else if (missingFormatValue) message = "option '--format <format>' argument missing";
	else if (formatValues.length > 1) message = "repeated --format";
	else if (formatValue !== undefined && format === undefined)
		message = `invalid format: ${formatValue}`;
	if (message !== undefined) return { ok: false, help, format: format ?? "human", message };
	return {
		ok: true,
		flags: {
			format: format ?? "human",
			help,
			jsonSchema,
			inputJson: inputJsonCount === 1,
			rest,
		},
	};
}
