import { Command, CommanderError, Option } from "commander";
import { z } from "zod";

import { stripAnsi } from "../ansi.ts";
import { resolveProcessCaps } from "../caps.ts";
import { buildCommanderArgument, buildCommanderOption } from "../commander-surface.ts";
import { buildSurfacePlan, type SurfacePlan } from "../surface.ts";
import {
	buildCommandJsonSchemaDocument,
	cliAnnotationFor,
	type ClinkrCommandDefinition,
	type ClinkrCommandMetadata,
	type RenderCapabilities,
} from "./command-definition.ts";
import {
	decodeCommandOutcome,
	envelopeJsonText,
	exitCodeFor,
	toEnvelope,
	type CommandExitCode,
	type CommandOutcome,
	type UsageErrorOutcome,
} from "./outcome.ts";
import { createFilesystemSource } from "./filesystem-source.ts";
import { composeSources, type ClinkrComposition } from "./programmatic-source.ts";
import { ClinkrTopology } from "./topology.ts";

export interface ClinkrRunOptions<TContext> {
	readonly context: TContext;
	/** Stdin source for `--input-json`; defaults to draining `process.stdin`. */
	readonly readStdin?: () => Promise<string>;
	/** ANSI capability override; defaults to the resolved process stdout caps. */
	readonly canEmitAnsi?: boolean;
}

export interface ClinkrContextFreeRunOptions {
	/** Stdin source for `--input-json`; defaults to draining `process.stdin`. */
	readonly readStdin?: () => Promise<string>;
	/** ANSI capability override; defaults to the resolved process stdout caps. */
	readonly canEmitAnsi?: boolean;
}

/** Options for a contextful {@link ClinkrContextfulApp.execute} invocation. */
export interface ClinkrExecuteOptions<TContext> {
	readonly context: TContext;
}

/**
 * Result of a typed host invocation through `execute()`: the decoded command
 * outcome, its exit-code mapping, and lazy rendered views bound to the
 * command definition.
 *
 * @remarks Provisional host surface: exported for host integrations ahead of
 * README promotion, which is deliberately deferred until the first in-process
 * host migration proves the contract.
 */
export interface ClinkrExecuteResult {
	readonly outcome: CommandOutcome<unknown>;
	readonly exitCode: CommandExitCode;
	/**
	 * Rendered human view mirroring what `run()` prints to stdout for
	 * success (rendered data, or pretty-JSON when no renderer) and negative
	 * (message). Returns `undefined` when `run()` would print nothing to
	 * stdout (bodyless success, failure, usage-error — hosts use
	 * `outcome.message`).
	 */
	renderHuman(capabilities: RenderCapabilities): string | undefined;
	/**
	 * Same contract as {@link ClinkrExecuteResult.renderHuman}; falls back to
	 * `renderHuman` when the definition declares no `renderMarkdown`,
	 * mirroring `run()`'s `md` format.
	 */
	renderMarkdown(capabilities: RenderCapabilities): string | undefined;
}

export interface ClinkrContextFreeApp {
	readonly requiresContext: false;
	run(argv: readonly string[], options?: ClinkrContextFreeRunOptions): Promise<number>;
	/**
	 * Typed host invocation: always schema-validates `request`, runs the
	 * handler, and returns the decoded outcome with lazy rendered views. Raw
	 * commands are terminal-only and are rejected with a programmer error.
	 *
	 * @remarks Provisional host surface; see {@link ClinkrExecuteResult}.
	 */
	execute(request: unknown): Promise<ClinkrExecuteResult>;
}

export interface ClinkrContextfulApp<TContext> {
	readonly requiresContext: true;
	run(argv: readonly string[], options: ClinkrRunOptions<TContext>): Promise<number>;
	/**
	 * Typed host invocation: always schema-validates `request`, runs the
	 * handler with the supplied context, and returns the decoded outcome with
	 * lazy rendered views. Raw commands are terminal-only and are rejected
	 * with a programmer error.
	 *
	 * @remarks Provisional host surface; see {@link ClinkrExecuteResult}.
	 */
	execute(request: unknown, options: ClinkrExecuteOptions<TContext>): Promise<ClinkrExecuteResult>;
}

export type ClinkrApp<TContext = never> = [TContext] extends [never]
	? ClinkrContextFreeApp
	: ClinkrContextfulApp<TContext>;

interface CreateClinkrAppBase {
	readonly name: string;
}

export interface CreateContextFreeClinkrAppOptions extends CreateClinkrAppBase {
	readonly commandDirectory: string;
	readonly requiresContext?: false;
}

export interface CreateContextfulClinkrAppOptions extends CreateClinkrAppBase {
	readonly commandDirectory: string;
	readonly requiresContext: true;
}

export interface CreateComposedContextFreeClinkrAppOptions extends CreateClinkrAppBase {
	readonly commandDirectory?: string;
	readonly requiresContext?: false;
}

export interface CreateComposedContextfulClinkrAppOptions extends CreateClinkrAppBase {
	readonly commandDirectory?: string;
	readonly requiresContext: true;
}

/**
 * Runtime context boundary: contextful execution (structured or raw) requires
 * a present, defined `context` in run options. TypeScript callers cannot omit
 * it, but JavaScript and other untyped callers can; this check guarantees no
 * contextful handler or raw runner ever receives an absent context.
 */
function requireRunContext<TContext>(
	options:
		| ClinkrRunOptions<TContext>
		| ClinkrContextFreeRunOptions
		| ClinkrExecuteOptions<TContext>
		| Record<string, never>,
): TContext {
	if (!("context" in options) || options.context === undefined) {
		throw new Error("clinkr: contextful command execution requires run options with context");
	}
	return options.context;
}

class TopologyClinkrApp<TContext> {
	private readonly name: string;
	private readonly topology: ClinkrTopology<TContext>;
	readonly requiresContext: boolean;

	constructor(options: {
		readonly name: string;
		readonly requiresContext: boolean;
		readonly topology: ClinkrTopology<TContext>;
	}) {
		this.name = options.name;
		this.topology = options.topology;
		this.requiresContext = options.requiresContext;
	}

	async run(
		argv: readonly string[],
		options: ClinkrRunOptions<TContext> | ClinkrContextFreeRunOptions = {},
	): Promise<number> {
		const { selected, metadata } = await this.loadDefinition();
		if (selected.kind === "raw") {
			// Raw dispatch branches before structured global-flag parsing: the raw
			// command owns its entire argv tail (including `--format`,
			// `--input-json`, `--json-schema`, `--help`, and `--`), all output
			// bytes, stdin, and the numeric exit status, which passes through
			// unchanged. Raw commands write to the process streams directly.
			const definition = selected.definition;
			if (definition.requiresContext === true) {
				return await definition.run({ context: requireRunContext(options), argv });
			}
			return await definition.run({ argv });
		}
		const definition = selected.definition;
		const canEmitAnsi = options.canEmitAnsi ?? resolveProcessCaps().colorDepth !== "none";
		const parsed = parseGlobalFlags(argv);
		if (parsed.ok ? parsed.flags.help : parsed.help) {
			process.stdout.write(
				buildCommandSurface(this.name, definition, metadata).command.helpInformation(),
			);
			return 0;
		}
		if (!parsed.ok) {
			return emitTerminalOutcome(
				frameworkUsageError(parsed.message, "invalid-request"),
				definition,
				parsed.format,
				canEmitAnsi,
			);
		}
		const { format, jsonSchema, inputJson, rest } = parsed.flags;
		const emitUsageError = (
			message: string,
			errorType: FrameworkUsageErrorType,
			data?: unknown,
		): number =>
			emitTerminalOutcome(
				frameworkUsageError(message, errorType, data),
				definition,
				format,
				canEmitAnsi,
			);
		if (jsonSchema && inputJson) {
			return emitUsageError(
				"--json-schema cannot be combined with --input-json",
				"invalid-request",
			);
		}
		if (jsonSchema) {
			process.stdout.write(`${envelopeJsonText(buildCommandJsonSchemaDocument(definition))}\n`);
			return 0;
		}
		let request: Record<string, unknown>;
		if (inputJson) {
			if (rest.length > 0) {
				return emitUsageError(
					"--input-json cannot be combined with command arguments",
					"invalid-request",
				);
			}
			const readStdin = options.readStdin ?? drainProcessStdin;
			const parsedJson = parseJsonInput(await readStdin(), definition.schema);
			if (!parsedJson.success) {
				return emitUsageError(parsedJson.message, parsedJson.errorType, parsedJson.data);
			}
			request = parsedJson.data as Record<string, unknown>;
		} else {
			const parsedArgv = parseArgv(this.name, rest, definition, metadata);
			if (!parsedArgv.success) {
				return emitUsageError(parsedArgv.message, "invalid-request");
			}
			request = parsedArgv.data as Record<string, unknown>;
		}
		const outcome = await this.invokeHandler(definition, request, options);
		return emitTerminalOutcome(outcome, definition, format, canEmitAnsi);
	}

	async execute(
		request: unknown,
		options?: ClinkrExecuteOptions<TContext>,
	): Promise<ClinkrExecuteResult> {
		const { selected } = await this.loadDefinition();
		if (selected.kind === "raw") {
			throw new Error("clinkr: raw commands execute only through the terminal adapter");
		}
		const definition = selected.definition;
		const decoded = decodeJsonRequest(request, definition.schema);
		const outcome: CommandOutcome<unknown> = decoded.success
			? await this.invokeHandler(definition, decoded.data as Record<string, unknown>, options ?? {})
			: frameworkUsageError(decoded.message, decoded.errorType, decoded.data);
		return {
			outcome,
			exitCode: exitCodeFor(outcome.status),
			renderHuman: (capabilities) => renderOutcomeView(definition, outcome, "human", capabilities),
			renderMarkdown: (capabilities) => renderOutcomeView(definition, outcome, "md", capabilities),
		};
	}

	/** Shared invocation core: handler call plus outcome decode, identical for every transport. */
	private async invokeHandler(
		definition: ClinkrCommandDefinition<TContext>,
		request: Record<string, unknown>,
		options:
			| ClinkrRunOptions<TContext>
			| ClinkrContextFreeRunOptions
			| ClinkrExecuteOptions<TContext>
			| Record<string, never>,
	): Promise<CommandOutcome<unknown>> {
		const handlerResult: unknown =
			definition.requiresContext === true
				? await definition.handler(requireRunContext(options), request)
				: await definition.handler(request);
		return decodeCommandOutcome(handlerResult, definition.resultSchema);
	}

	private async loadDefinition() {
		const root = await this.topology.open([]);
		if (root.defaultCommand === undefined) {
			throw new Error("clinkr: root scope has no default command");
		}
		const loaded = await this.topology.load(root.defaultCommand);
		if ((loaded.selected.definition.requiresContext === true) !== this.requiresContext) {
			throw new Error("clinkr: selected command context mode does not match the app");
		}
		return loaded;
	}
}

export function createClinkrApp(options: CreateContextFreeClinkrAppOptions): ClinkrContextFreeApp;
export function createClinkrApp<TContext>(
	options: CreateContextfulClinkrAppOptions,
): ClinkrContextfulApp<TContext>;
export function createClinkrApp(
	options: CreateComposedContextFreeClinkrAppOptions,
	configure: (composition: ClinkrComposition<never>) => void,
): ClinkrContextFreeApp;
export function createClinkrApp<TContext>(
	options: CreateComposedContextfulClinkrAppOptions,
	configure: (composition: ClinkrComposition<TContext>) => void,
): ClinkrContextfulApp<TContext>;
export function createClinkrApp<TContext>(
	options:
		| CreateContextFreeClinkrAppOptions
		| CreateContextfulClinkrAppOptions
		| CreateComposedContextFreeClinkrAppOptions
		| CreateComposedContextfulClinkrAppOptions,
	configure?: (composition: ClinkrComposition<TContext>) => void,
): ClinkrContextFreeApp | ClinkrContextfulApp<TContext> {
	const sources = configure === undefined ? [] : [...composeSources(configure)];
	if (options.commandDirectory !== undefined) {
		sources.unshift(
			createFilesystemSource<TContext>({ commandDirectory: options.commandDirectory }),
		);
	}
	if (sources.length === 0) throw new Error("clinkr: app requires at least one mounted source");
	return new TopologyClinkrApp<TContext>({
		name: options.name,
		requiresContext: options.requiresContext === true,
		topology: new ClinkrTopology({ sources }),
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
	const command = new Command(name)
		.description(metadata.description)
		.exitOverride()
		.configureOutput({ writeOut: () => {}, writeErr: () => {} });
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

function frameworkUsageError(
	message: string,
	errorType: FrameworkUsageErrorType,
	data?: unknown,
): UsageErrorOutcome {
	return {
		status: "usage-error",
		errorType,
		message,
		...(data === undefined ? {} : { data }),
	};
}

type DecodeRequestResult =
	| { success: true; data: unknown }
	| { success: false; message: string; errorType: FrameworkUsageErrorType; data?: unknown };

/**
 * Shared request decode for every non-argv transport: object-shape check,
 * top-level unknown-key rejection before field validation (so unknown-key
 * errors retain precedence over field errors), then the full schema decode
 * (defaults, transforms, refinements).
 */
function decodeJsonRequest(value: unknown, schema: z.ZodObject): DecodeRequestResult {
	const transported = z.object({}).loose().safeParse(value);
	if (!transported.success) {
		return {
			success: false,
			message: "request must be a JSON object",
			errorType: "invalid-request",
		};
	}
	// Reject top-level unknown keys even for passthrough schemas, before field
	// validation, so unknown-key errors retain precedence over field errors.
	const declaredKeys = new Set(Object.keys(schema.shape));
	const unknownKeys = Object.keys(transported.data).filter((key) => !declaredKeys.has(key));
	if (unknownKeys.length > 0) {
		return {
			success: false,
			message: "request did not match its schema",
			errorType: "invalid-request",
			data: {
				issues: [
					{
						code: "unrecognized_keys",
						keys: unknownKeys,
						path: [],
						message: `Unrecognized key${unknownKeys.length > 1 ? "s" : ""}: ${unknownKeys.map((key) => JSON.stringify(key)).join(", ")}`,
					},
				],
			},
		};
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

/**
 * Terminal stdin-JSON transport decode: BOM strip and the
 * exactly-one-JSON-object transport contract (`invalid-json-input`), then the
 * shared {@link decodeJsonRequest} schema decode (`invalid-request`).
 */
function parseJsonInput(text: string, schema: z.ZodObject): DecodeRequestResult {
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
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {
			success: false,
			message: "stdin JSON must be an object",
			errorType: "invalid-json-input",
		};
	}
	return decodeJsonRequest(value, schema);
}

/** Default stdin source for the terminal adapter's `--input-json` transport. */
async function drainProcessStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
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

/**
 * Framework-owned ANSI output boundary: a sink that does not advertise ANSI
 * support never receives escape sequences, regardless of where the text came
 * from (renderer output or handler-supplied outcome messages). `canEmitAnsi`
 * stays advisory to renderers; this is the enforcement point. JSON envelopes
 * bypass this because JSON.stringify escapes control characters.
 */
function boundaryText(canEmitAnsi: boolean, text: string): string {
	return canEmitAnsi ? text : stripAnsi(text);
}

/**
 * Stdout view of an outcome shared by run()'s human/md formats and
 * execute()'s render accessors: rendered success data (pretty-JSON fallback
 * when no renderer), negative message, and `undefined` when nothing goes to
 * stdout (bodyless success, failure, usage-error). The ANSI output boundary
 * is enforced here so both surfaces mirror each other exactly.
 */
function renderOutcomeView(
	definition: ClinkrCommandDefinition,
	outcome: CommandOutcome<unknown>,
	format: "human" | "md",
	capabilities: RenderCapabilities,
): string | undefined {
	if (outcome.status === "success") {
		if (outcome.data === undefined) return undefined;
		const renderer =
			format === "md"
				? (definition.renderMarkdown ?? definition.renderHuman)
				: definition.renderHuman;
		const text =
			renderer === undefined
				? envelopeJsonText(outcome.data)
				: renderer(outcome.data, capabilities);
		return boundaryText(capabilities.canEmitAnsi, text);
	}
	if (outcome.status === "negative") {
		return boundaryText(capabilities.canEmitAnsi, outcome.message);
	}
	return undefined;
}

/**
 * Single terminal emission tail: every structured outcome — handler-produced
 * or framework usage error — flows through here exactly once. JSON format
 * writes the machine envelope to stdout; human/md write the rendered view to
 * stdout and failure/usage-error messages to stderr.
 */
function emitTerminalOutcome(
	outcome: CommandOutcome<unknown>,
	definition: ClinkrCommandDefinition,
	format: OutputFormat,
	canEmitAnsi: boolean,
): number {
	if (format === "json") {
		process.stdout.write(`${envelopeJsonText(toEnvelope(outcome))}\n`);
		return exitCodeFor(outcome.status);
	}
	const view = renderOutcomeView(definition, outcome, format, { canEmitAnsi });
	if (view !== undefined) {
		process.stdout.write(`${view}\n`);
	} else if (outcome.status === "failure" || outcome.status === "usage-error") {
		process.stderr.write(`${boundaryText(canEmitAnsi, outcome.message)}\n`);
	}
	return exitCodeFor(outcome.status);
}
