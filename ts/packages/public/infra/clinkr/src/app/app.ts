import { optionalEntries } from "@nseng-ai/foundation/primitives";
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
	type ClinkrGroupDefinition,
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
import { hasUnescapedHelp, parseGlobalFlags, type OutputFormat } from "./framework-arguments.ts";
import { ClinkrNavigator } from "./navigator.ts";
import { composeSources, type ClinkrComposition } from "./programmatic-source.ts";
import { ClinkrTopology, type OpenedScope } from "./topology.ts";

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
	/** Root-only package version exposed as `-V` / `--version` when configured. */
	readonly version?: string;
	/** Root-only runtime diagnostic text exposed as `--runtime` when configured. */
	readonly runtimeInfo?: () => string;
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
function requireRunContext<TContext>(options: unknown): TContext {
	if (
		typeof options !== "object" ||
		options === null ||
		!("context" in options) ||
		options.context === undefined
	) {
		throw new Error("clinkr: contextful command execution requires run options with context");
	}
	return options.context as TContext;
}

const SUCCESS_EXIT_CODE = exitCodeFor("success");
const USAGE_ERROR_EXIT_CODE = exitCodeFor("usage-error");

interface TopologyClinkrAppBaseOptions<TContext> {
	readonly name: string;
	readonly topology: ClinkrTopology<TContext>;
	readonly version?: string;
	readonly runtimeInfo?: () => string;
}

type TopologyClinkrAppOptions<TContext> = TopologyClinkrAppBaseOptions<TContext> & {
	readonly requiresContext: boolean;
};

class TopologyClinkrApp<TContext> {
	private readonly name: string;
	private readonly navigator: ClinkrNavigator<TContext>;
	private readonly version: string | undefined;
	private readonly runtimeInfo: (() => string) | undefined;
	readonly requiresContext: boolean;

	constructor(options: TopologyClinkrAppOptions<TContext>) {
		this.name = options.name;
		this.requiresContext = options.requiresContext;
		this.version = options.version;
		this.runtimeInfo = options.runtimeInfo;
		this.navigator = new ClinkrNavigator({
			topology: options.topology,
			requiresContext: options.requiresContext,
			hasVersion: options.version !== undefined,
			hasRuntime: options.runtimeInfo !== undefined,
		});
	}

	async run(
		argv: readonly string[],
		options: ClinkrRunOptions<TContext> | ClinkrContextFreeRunOptions = {},
	): Promise<number> {
		const navigation = await this.navigator.navigate(argv);
		if (navigation.type === "version") {
			process.stdout.write(`${this.version}\n`);
			return SUCCESS_EXIT_CODE;
		}
		if (navigation.type === "runtime") {
			process.stdout.write(this.runtimeInfo?.() ?? "");
			return SUCCESS_EXIT_CODE;
		}
		let loaded;
		let selectedArgv: readonly string[];
		let selectedName: string;
		if (navigation.type === "scope") {
			if (navigation.scope.defaultCommand === undefined) {
				if (navigation.tail.length > 0 && !hasUnescapedHelp(navigation.tail)) {
					process.stderr.write(
						`clinkr: unknown route at ${[...navigation.path, ...navigation.tail].join(" ")}\n`,
					);
					return USAGE_ERROR_EXIT_CODE;
				}
				process.stdout.write(
					await this.buildScopeHelp(
						navigation.path,
						navigation.scope,
						navigation.path.length === 0,
						navigation.definition,
					),
				);
				return SUCCESS_EXIT_CODE;
			}
			loaded = await this.navigator.load(navigation.scope.defaultCommand);
			selectedArgv = navigation.tail;
			selectedName = navigation.path.at(-1) ?? this.name;
			if (loaded.selected.kind === "structured" && hasUnescapedHelp(selectedArgv)) {
				process.stdout.write(
					await this.buildScopeHelp(
						navigation.path,
						navigation.scope,
						navigation.path.length === 0,
						navigation.definition,
					),
				);
				return SUCCESS_EXIT_CODE;
			}
		} else {
			loaded = navigation.loaded;
			selectedArgv = navigation.tail;
			selectedName = navigation.path.at(-1) ?? this.name;
		}
		const { selected, metadata } = loaded;
		if (selected.kind === "raw") {
			// Raw dispatch branches before structured global-flag parsing and owns
			// its selected argv tail, bytes, stdin, and numeric exit status.
			const definition = selected.definition;
			if (definition.requiresContext === true) {
				return await definition.run({ context: requireRunContext(options), argv: selectedArgv });
			}
			return await definition.run({ argv: selectedArgv });
		}
		const definition = selected.definition;
		const canEmitAnsi = options.canEmitAnsi ?? resolveProcessCaps().colorDepth !== "none";
		const parsed = parseGlobalFlags(selectedArgv);
		if ((parsed.ok ? parsed.flags.help : parsed.help) && hasUnescapedHelp(selectedArgv)) {
			process.stdout.write(
				buildCommandSurface(selectedName, definition, metadata).command.helpInformation(),
			);
			return SUCCESS_EXIT_CODE;
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
			return SUCCESS_EXIT_CODE;
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
			const parsedArgv = parseArgv(selectedName, rest, definition, metadata);
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
		const { selected } = await this.navigator.loadRootDefault();
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

	private async buildScopeHelp(
		path: readonly string[],
		scope: OpenedScope<TContext>,
		isRoot: boolean,
		groupDefinition?: ClinkrGroupDefinition,
	): Promise<string> {
		const name = path.length === 0 ? this.name : (path.at(-1) ?? this.name);
		let command: Command;
		if (scope.defaultCommand === undefined) {
			command = createContainedCommand(name);
		} else {
			const loaded = await this.navigator.load(scope.defaultCommand);
			command =
				loaded.selected.kind === "structured"
					? buildCommandSurface(name, loaded.selected.definition, loaded.metadata).command
					: createContainedCommand(name).description(loaded.metadata.description);
		}
		if (groupDefinition !== undefined) {
			command.description(groupDefinition.summary ?? groupDefinition.description);
		}
		if (isRoot && this.version !== undefined) {
			command.version(this.version, "-V, --version", "Show the package version.");
		}
		if (isRoot && this.runtimeInfo !== undefined) {
			command.addOption(new Option("--runtime", "Show CLI runtime diagnostics and exit."));
		}
		for (const [childName, route] of scope.commands) {
			const metadata = route.command.metadata;
			const child = new Command(childName).description(metadata.summary ?? metadata.description);
			if (metadata.aliases !== undefined) child.aliases([...metadata.aliases]);
			if (metadata.helpGroup !== undefined) child.helpGroup(metadata.helpGroup);
			command.addCommand(child, { hidden: metadata.hidden === true });
		}
		for (const [childName, group] of scope.groups) {
			const child = new Command(childName).description(
				group.definition.summary ?? group.definition.description,
			);
			if (group.definition.aliases !== undefined) child.aliases([...group.definition.aliases]);
			if (group.definition.helpGroup !== undefined) child.helpGroup(group.definition.helpGroup);
			command.addCommand(child, { hidden: group.definition.hidden === true });
		}
		return command.helpInformation();
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
	const topology = new ClinkrTopology({
		sources,
	});
	const baseOptions = {
		name: options.name,
		topology,
		...optionalEntries({
			version: options.version,
			runtimeInfo: options.runtimeInfo,
		}),
	};
	if (options.requiresContext === true) {
		return new TopologyClinkrApp<TContext>({
			...baseOptions,
			requiresContext: true,
		});
	}
	return new TopologyClinkrApp<TContext>({
		...baseOptions,
		requiresContext: false,
	});
}

interface CommandSurface {
	readonly command: Command;
	readonly surface: SurfacePlan;
}

function createContainedCommand(name: string): Command {
	return new Command(name)
		.exitOverride()
		.configureOutput({ writeOut: () => {}, writeErr: () => {} });
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
	const command = createContainedCommand(name).description(metadata.description);
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
