import path from "node:path";

import { Command, CommanderError, Option } from "commander";
import { z } from "zod";

import { stripAnsi } from "../ansi.ts";
import { buildCommanderArgument, buildCommanderOption } from "../commander-surface.ts";
import type { ClinkrIo } from "../io.ts";
import { createProcessIo } from "../io.ts";
import { buildSurfacePlan, type SurfacePlan } from "../surface.ts";
import {
	buildCommandJsonSchemaDocument,
	cliAnnotationFor,
	type ClinkrCommandDefinition,
	type ClinkrCommandMetadata,
} from "./command-definition.ts";
import {
	decodeCommandOutcome,
	exitCodeFor,
	stableJsonText,
	toEnvelope,
	type CommandOutcome,
	type UsageErrorOutcome,
} from "./outcome.ts";
import { importSelectedCommand, type LoadedSelectedCommand } from "./selected-command.ts";

export interface ClinkrRunOptions<TContext> {
	readonly context: TContext;
	readonly io?: ClinkrIo;
	readonly readStdin?: () => Promise<string>;
}

export interface ClinkrContextFreeRunOptions {
	readonly io?: ClinkrIo;
	readonly readStdin?: () => Promise<string>;
}

export interface ClinkrContextFreeApp {
	readonly requiresContext: false;
	run(argv: readonly string[], options?: ClinkrContextFreeRunOptions): Promise<number>;
}

export interface ClinkrContextfulApp<TContext> {
	readonly requiresContext: true;
	run(argv: readonly string[], options: ClinkrRunOptions<TContext>): Promise<number>;
}

export type ClinkrApp<TContext = never> = [TContext] extends [never]
	? ClinkrContextFreeApp
	: ClinkrContextfulApp<TContext>;

interface CreateClinkrAppBase {
	readonly name: string;
	readonly commandDirectory: string;
}

export interface CreateContextFreeClinkrAppOptions extends CreateClinkrAppBase {
	readonly requiresContext?: false;
}

export interface CreateContextfulClinkrAppOptions extends CreateClinkrAppBase {
	readonly requiresContext: true;
}

/**
 * Runtime context boundary: contextful execution (structured or raw) requires
 * a present, defined `context` in run options. TypeScript callers cannot omit
 * it, but JavaScript and other untyped callers can; this check guarantees no
 * contextful handler or raw runner ever receives an absent context.
 */
function requireRunContext<TContext>(
	options: ClinkrRunOptions<TContext> | ClinkrContextFreeRunOptions,
): TContext {
	if (!("context" in options) || options.context === undefined) {
		throw new Error("clinkr: contextful command execution requires run options with context");
	}
	return options.context;
}

class FilesystemClinkrApp<TContext> {
	private readonly name: string;
	private readonly commandDirectory: string;
	readonly requiresContext: boolean;
	private loaded: Promise<LoadedSelectedCommand<TContext>> | undefined;

	constructor(options: CreateClinkrAppBase & { requiresContext: boolean }) {
		if (!path.isAbsolute(options.commandDirectory)) {
			throw new Error("clinkr: commandDirectory must be absolute");
		}
		this.name = options.name;
		this.commandDirectory = options.commandDirectory;
		this.requiresContext = options.requiresContext;
	}

	async run(
		argv: readonly string[],
		options: ClinkrRunOptions<TContext> | ClinkrContextFreeRunOptions = {},
	): Promise<number> {
		const io = options.io ?? createProcessIo();
		const { selected, metadata } = await this.loadDefinition();
		if ((selected.definition.requiresContext === true) !== this.requiresContext) {
			throw new Error("clinkr: selected command context mode does not match the app");
		}
		if (selected.kind === "raw") {
			// Raw dispatch branches before structured global-flag parsing: the raw
			// command owns its entire argv tail (including `--format`,
			// `--input-json`, `--json-schema`, `--help`, and `--`), all output
			// bytes, stdin, and the numeric exit status, which passes through
			// unchanged.
			const definition = selected.definition;
			if (definition.requiresContext === true) {
				return await definition.run({ context: requireRunContext(options), argv, io });
			}
			return await definition.run({ argv, io });
		}
		const definition = selected.definition;
		const parsed = parseGlobalFlags(argv);
		if (parsed.ok ? parsed.flags.help : parsed.help) {
			io.stdout(buildCommandSurface(this.name, definition, metadata).command.helpInformation());
			return 0;
		}
		if (!parsed.ok) return emitUsageError(io, parsed.format, parsed.message, "invalid-request");
		const { format, jsonSchema, inputJson, rest } = parsed.flags;
		if (jsonSchema && inputJson) {
			return emitUsageError(
				io,
				format,
				"--json-schema cannot be combined with --input-json",
				"invalid-request",
			);
		}
		if (jsonSchema) {
			io.stdout(`${stableJsonText(buildCommandJsonSchemaDocument(definition))}\n`);
			return 0;
		}
		let request: Record<string, unknown>;
		if (inputJson) {
			if (rest.length > 0) {
				return emitUsageError(
					io,
					format,
					"--input-json cannot be combined with command arguments",
					"invalid-request",
				);
			}
			const readStdin = options.readStdin ?? io.readStdin;
			if (readStdin === undefined) {
				return emitUsageError(io, format, "--input-json requires stdin", "invalid-json-input");
			}
			const parsedJson = parseJsonInput(await readStdin(), definition.schema);
			if (!parsedJson.success)
				return emitUsageError(
					io,
					format,
					parsedJson.message,
					parsedJson.errorType,
					parsedJson.data,
				);
			request = parsedJson.data as Record<string, unknown>;
		} else {
			const parsedArgv = parseArgv(this.name, rest, definition, metadata);
			if (!parsedArgv.success)
				return emitUsageError(io, format, parsedArgv.message, "invalid-request");
			request = parsedArgv.data as Record<string, unknown>;
		}
		const handlerResult: unknown =
			definition.requiresContext === true
				? await definition.handler(requireRunContext(options), request)
				: await definition.handler(request);
		const outcome = decodeCommandOutcome(handlerResult, definition.resultSchema);
		emitOutcome(io, outcome, definition, format);
		return exitCodeFor(outcome.status);
	}

	// Transactional selected loading: concurrent requests share in-flight work,
	// successful loads cache for the app lifetime, and failed loads clear so a
	// later request can retry.
	private async loadDefinition(): Promise<LoadedSelectedCommand<TContext>> {
		if (this.loaded !== undefined) return this.loaded;
		this.loaded = importSelectedCommand<TContext>(this.commandDirectory);
		try {
			return await this.loaded;
		} catch (error) {
			this.loaded = undefined;
			throw error;
		}
	}
}

export function createClinkrApp(options: CreateContextFreeClinkrAppOptions): ClinkrContextFreeApp;
export function createClinkrApp<TContext>(
	options: CreateContextfulClinkrAppOptions,
): ClinkrContextfulApp<TContext>;
export function createClinkrApp<TContext>(
	options: CreateContextFreeClinkrAppOptions | CreateContextfulClinkrAppOptions,
): ClinkrContextFreeApp | ClinkrContextfulApp<TContext> {
	return new FilesystemClinkrApp<TContext>({
		...options,
		requiresContext: options.requiresContext === true,
	});
}

interface CommandSurface {
	readonly command: Command;
	readonly surface: SurfacePlan;
}

/**
 * Single extraction pass from the declared schema to both the surface plan
 * and the commander registration built from that same plan, so the two can
 * never drift.
 */
function buildCommandSurface(
	name: string,
	definition: ClinkrCommandDefinition,
	metadata: ClinkrCommandMetadata,
): CommandSurface {
	const positionals: Record<string, { position: number; description?: string }> = {};
	const optionSpecs: Record<string, { short?: string; description?: string }> = {};
	for (const [key, field] of Object.entries(definition.schema.shape)) {
		const annotation = cliAnnotationFor(field as z.ZodType);
		if (annotation?.type === "positional") positionals[key] = annotation.options;
		if (annotation?.type === "option") optionSpecs[key] = annotation.options;
	}
	const surface = buildSurfacePlan({
		commandName: name,
		schema: definition.schema,
		positionals,
		optionSpecs,
	});
	// `hidden` and `helpGroup` are intentionally unconsumed here: the
	// recursive-topology roadmap rows of the `clinkr-readme-driven-development`
	// objective own them (they only matter in a parent's subcommand listing).
	// Commander renders `summary` only in a parent's subcommand listing too, so
	// wiring it is invisible on this root command today; `aliases` show in the
	// usage line.
	const command = new Command(name)
		.description(metadata.description)
		.exitOverride()
		.configureOutput({ writeOut: () => {}, writeErr: () => {} });
	if (metadata.summary !== undefined) command.summary(metadata.summary);
	if (metadata.aliases !== undefined) command.aliases([...metadata.aliases]);
	for (const positional of surface.positionals) {
		command.addArgument(buildCommanderArgument(positional, { requiredness: "commander" }));
	}
	for (const option of surface.options) {
		command.addOption(buildCommanderOption(option, { applyDefault: true }));
	}
	// Help-display-only: the global flags below are parsed exclusively by
	// parseGlobalFlags before commander ever sees argv (parseArgv receives a
	// `rest` that never contains them). These registrations exist solely so
	// `--help` output lists the standard flags.
	command.addOption(
		new Option("--format <format>").choices(["human", "json", "md"]).default("human"),
	);
	command.addOption(new Option("--input-json"));
	command.addOption(new Option("--json-schema"));
	return { command, surface };
}

function parseArgv(
	name: string,
	argv: readonly string[],
	definition: ClinkrCommandDefinition,
	metadata: ClinkrCommandMetadata,
): { success: true; data: unknown } | { success: false; message: string } {
	const { command, surface } = buildCommandSurface(name, definition, metadata);
	try {
		command.parse([...argv], { from: "user" });
	} catch (error) {
		if (error instanceof CommanderError) return { success: false, message: error.message };
		throw error;
	}
	const values: Record<string, unknown> = {};
	const parsedOptions = command.opts<Record<string, unknown>>();
	for (const option of surface.options) values[option.key] = parsedOptions[option.attributeName];
	const args = command.processedArgs;
	for (const [index, positional] of surface.positionals.entries())
		values[positional.key] = args[index];
	const parsed = definition.schema.safeParse(values);
	return parsed.success
		? { success: true, data: parsed.data }
		: { success: false, message: z.prettifyError(parsed.error) };
}

/** Usage-error discriminants the framework itself emits (handlers own other values). */
type FrameworkUsageErrorType = "invalid-request" | "invalid-json-input";

function parseJsonInput(
	text: string,
	schema: z.ZodObject,
):
	| { success: true; data: unknown }
	| { success: false; message: string; errorType: FrameworkUsageErrorType; data?: unknown } {
	const normalized = text.startsWith("\uFEFF") ? text.slice(1) : text;
	if (normalized.trim() === "")
		return { success: false, message: "stdin is empty", errorType: "invalid-json-input" };
	let value: unknown;
	try {
		value = JSON.parse(normalized);
	} catch {
		return {
			success: false,
			message: "stdin is not exactly one JSON value",
			errorType: "invalid-json-input",
		};
	}
	const transported = z.object({}).loose().safeParse(value);
	if (!transported.success)
		return {
			success: false,
			message: "stdin JSON must be an object",
			errorType: "invalid-json-input",
		};
	// Strict pre-check owns top-level unknown-key rejection even when the
	// declared schema is passthrough; all other validation is deferred to the
	// authoritative declared-schema parse below.
	const strictCheck = z.strictObject(schema.shape).safeParse(transported.data);
	if (!strictCheck.success) {
		const unknownKeyIssues = strictCheck.error.issues.filter(
			(issue) => issue.code === "unrecognized_keys",
		);
		if (unknownKeyIssues.length > 0) {
			return {
				success: false,
				message: "request did not match its schema",
				errorType: "invalid-request",
				data: { issues: unknownKeyIssues },
			};
		}
	}
	const parsed = schema.safeParse(transported.data);
	return parsed.success
		? { success: true, data: parsed.data }
		: {
				success: false,
				message: "request did not match its schema",
				errorType: "invalid-request",
				data: { issues: parsed.error.issues },
			};
}

type OutputFormat = "human" | "json" | "md";

interface GlobalFlags {
	readonly format: OutputFormat;
	readonly help: boolean;
	readonly jsonSchema: boolean;
	readonly inputJson: boolean;
	/**
	 * argv with every global flag (and `--format` value) removed. Everything
	 * from the first top-level `--` onward is passed through verbatim,
	 * including the `--` itself, so commander can apply its standard
	 * end-of-options handling.
	 */
	readonly rest: readonly string[];
}

type GlobalFlagsResult =
	| { readonly ok: true; readonly flags: GlobalFlags }
	| {
			readonly ok: false;
			/** Best-effort help detection so help still wins over a bad parse. */
			readonly help: boolean;
			/** Best-effort format so usage-error emission honors a valid `--format`. */
			readonly format: OutputFormat;
			readonly message: string;
	  };

/**
 * Single owner of the global-flag grammar (`--help`/`-h`, `--format`,
 * `--input-json`, `--json-schema`). One pass over argv; the commander
 * registrations for these flags in {@link buildCommandSurface} are
 * help-display-only and never parse them.
 *
 * A bare `--` terminates global-flag scanning: it and every following token
 * flow to `rest` unchanged (commander then treats the tokens after `--` as
 * positionals), so command arguments that look like global flags can be
 * escaped.
 */
function parseGlobalFlags(argv: readonly string[]): GlobalFlagsResult {
	const formatValues: string[] = [];
	const rest: string[] = [];
	let help = false;
	let jsonSchema = false;
	let inputJsonCount = 0;
	let missingFormatValue = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === undefined) continue;
		if (argument === "--") {
			rest.push(...argv.slice(index));
			break;
		}
		if (argument === "--help" || argument === "-h") help = true;
		else if (argument === "--json-schema") jsonSchema = true;
		else if (argument === "--input-json") inputJsonCount += 1;
		else if (argument === "--format") {
			const value = argv[index + 1];
			if (value === undefined || value.startsWith("-")) missingFormatValue = true;
			else {
				formatValues.push(value);
				index += 1;
			}
		} else if (argument.startsWith("--format=")) {
			formatValues.push(argument.slice("--format=".length));
		} else rest.push(argument);
	}
	const formatValue = formatValues.length === 1 ? formatValues[0] : undefined;
	const format =
		formatValue === "human" || formatValue === "json" || formatValue === "md"
			? formatValue
			: undefined;
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

function emitOutcome(
	io: ClinkrIo,
	outcome: CommandOutcome<unknown>,
	definition: ClinkrCommandDefinition,
	format: "human" | "json" | "md",
): void {
	if (format === "json") {
		io.stdout(`${stableJsonText(toEnvelope(outcome))}\n`);
		return;
	}
	if (outcome.status === "success") {
		if (outcome.data === undefined) return;
		const renderer =
			format === "md"
				? (definition.renderMarkdown ?? definition.renderHuman)
				: definition.renderHuman;
		const text =
			renderer === undefined
				? stableJsonText(outcome.data)
				: renderer(outcome.data, { canEmitAnsi: io.canEmitAnsi === true });
		// Framework-owned safety net: `canEmitAnsi` is advisory to renderers, but
		// plain sinks must never receive escapes even when a renderer ignores the
		// capability. Stripping stable JSON fallback text is a no-op because
		// JSON.stringify escapes control characters.
		io.stdout(`${io.canEmitAnsi === true ? text : stripAnsi(text)}\n`);
		return;
	}
	if (outcome.status === "negative") {
		io.stdout(`${outcome.message}\n`);
		return;
	}
	io.stderr(`${outcome.message}\n`);
}

function emitUsageError(
	io: ClinkrIo,
	format: OutputFormat,
	message: string,
	errorType: FrameworkUsageErrorType,
	data?: unknown,
): number {
	const outcome: UsageErrorOutcome = {
		status: "usage-error",
		errorType,
		message,
		...(data === undefined ? {} : { data }),
	};
	if (format === "json") io.stdout(`${stableJsonText(toEnvelope(outcome))}\n`);
	else io.stderr(`${message}\n`);
	return exitCodeFor(outcome.status);
}
