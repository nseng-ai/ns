import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { z } from "zod";

import {
	CLINKR_JSON_SCHEMA_OPTION,
	CLINKR_RENDERED_COMMAND_OPTIONS,
	completeClinkrWords,
	completeClinkrWordsAsync,
	completionOptionFromSurface,
	type ClinkrCompletionCommandPlan,
	type ClinkrCompletionGroupPlan,
	type ClinkrCompletionRequest,
	type ClinkrCompletionResult,
	type ClinkrDynamicCompletionProvider,
} from "./completion.ts";
import { emitExit, type RenderCapabilities } from "./emit.ts";
import {
	envelopeJsonText,
	type ClinkrExit,
	type ClinkrOutcomeSchemas,
	usageErrorMachineEnvelope,
	validateOutcomeData,
} from "./exit.ts";
import { clinkrFormatFromArgs, clinkrFormatFromOption } from "./format.ts";
import { createProcessIo, type ClinkrIo } from "./io.ts";
import { buildJsonSchemaDocument, type JsonSchemaDocument } from "./json-schema.ts";
import {
	buildSurfacePlan,
	type OptionPlan,
	type OptionSpec,
	type PositionalPlan,
	type PositionalSpec,
	type SurfacePlan,
} from "./surface.ts";

export type ClinkrHandler<
	TContext,
	S extends z.ZodObject,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> = (
	ctx: TContext,
	request: z.output<S>,
) => Promise<ClinkrExit<TResult, TNegative, TFailure, TUsageError>>;

export interface ClinkrCommandSpec<
	TContext,
	S extends z.ZodObject,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> {
	name: string;
	description?: string;
	/** Short summary for parent help lists; omitted from leaf command help body. */
	summary?: string;
	/** Parent help section heading for this command. */
	helpGroup?: string;
	/** Explicit public aliases for this command. */
	aliases?: readonly string[];
	/** Suppresses this command from its parent's help; it stays invocable. */
	isHidden?: boolean;
	schema: S;
	handler: ClinkrHandler<TContext, S, TResult, TNegative, TFailure, TUsageError>;
	/** Supplying a status schema requires and validates data for that outcome. */
	resultSchema?: z.ZodType<TResult>;
	negativeSchema?: z.ZodType<TNegative>;
	failureSchema?: z.ZodType<TFailure>;
	usageErrorSchema?: z.ZodType<TUsageError>;
	/**
	 * Serve this document verbatim for `--json-schema` instead of generating one
	 * from the schemas. For commands whose published schema document predates
	 * clinkr (e.g. pinned Python-parity documents).
	 */
	schemaDocument?: () => JsonSchemaDocument;
	/**
	 * Human rendering for the ok variant; default is indented JSON of the data. Receives only
	 * (data, caps): parsed request flags are never threaded to renderers, so a display toggle
	 * needs explicit plumbing — prefer keeping full detail on the markdown surface instead.
	 */
	renderHuman?: (
		data: TResult | TNegative | TFailure | TUsageError,
		caps: RenderCapabilities,
	) => string;
	/** Markdown rendering falls back to human rendering when absent. */
	renderMarkdown?: (
		data: TResult | TNegative | TFailure | TUsageError,
		caps: RenderCapabilities,
	) => string;
	/** Rendered commands cannot opt into raw mode; use `@nseng-ai/clinkr/raw`. */
	isRawExit?: never;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
}

export interface RawCommandInvocation {
	/** Every token after the selected command, preserved for the command-owned parser. */
	readonly argv: readonly string[];
	/** The invocation's output sinks; raw commands own every byte they write. */
	readonly io: ClinkrIo;
}

export interface RawCommandSpec<TContext> {
	name: string;
	description?: string;
	/** Short summary for parent help lists; omitted from leaf command help body. */
	summary?: string;
	/** Parent help section heading for this command. */
	helpGroup?: string;
	/** Explicit public aliases for this command. */
	aliases?: readonly string[];
	/** Suppresses this command from its parent's help; it stays invocable. */
	isHidden?: boolean;
	isRawExit: true;
	/** Receives the raw argv tail and owns output bytes and exit status. */
	run: (ctx: TContext, invocation: RawCommandInvocation) => Promise<number>;
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
	handler?: never;
	resultSchema?: never;
	negativeSchema?: never;
	failureSchema?: never;
	usageErrorSchema?: never;
	renderHuman?: never;
	renderMarkdown?: never;
	schemaDocument?: never;
}

export interface DefaultRawCommandSpec<TContext> extends Omit<
	RawCommandSpec<TContext>,
	"name" | "summary" | "description"
> {
	name?: never;
	summary?: never;
	description?: never;
}

export interface DefaultCommandSpec<
	TContext,
	S extends z.ZodObject,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> extends Omit<
	ClinkrCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>,
	"name" | "summary" | "description"
> {
	name?: never;
	summary?: never;
	description?: never;
}

export interface ClinkrGroupOptions {
	name: string;
	description?: string;
	/** Parent help section heading for this group. */
	helpGroup?: string;
	/** Suppresses this group from its parent's help; it stays invocable. */
	isHidden?: boolean;
	/** Explicit public aliases for this group. */
	aliases?: readonly string[];
	/** Root-only package version exposed as `-V, --version`. */
	version?: string;
	/** Root-only runtime diagnostic text exposed as `--runtime`. */
	runtimeInfo?: () => string;
	/** Migration-only: immutable apps enable the reconciled outcome contract. */
	validateOutcomes?: boolean;
}

export interface ClinkrRunOptions<TContext> {
	context: TContext;
	io?: ClinkrIo;
}

export interface ClinkrCompleteAsyncOptions<TContext> {
	context: TContext;
	onDynamicCompletionError?: (error: unknown) => void;
}

interface RegisteredCommand<TContext> {
	name: string;
	description?: string;
	summary?: string;
	helpGroup?: string;
	aliases: readonly string[];
	isHidden: boolean;
	schema: z.ZodObject;
	schemaDocument?: () => JsonSchemaDocument;
	execution: RenderedExecution<TContext> | RawExecution<TContext>;
	plan: SurfacePlan;
	completionProvider: ClinkrDynamicCompletionProvider<TContext> | undefined;
	shouldPassThrough: boolean;
	validateOutcomes: boolean;
}

interface RenderedExecution<TContext> {
	type: "rendered";
	outcomeSchemas: ClinkrOutcomeSchemas;
	handler: (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>;
	renderHuman: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
	renderMarkdown: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
}

interface RawExecution<TContext> {
	type: "raw";
	run: (ctx: TContext, invocation: RawCommandInvocation) => Promise<number>;
}

interface RunState {
	exitCode: number;
}

interface BuildLeafCommandOptions<TContext> {
	registered: RegisteredCommand<TContext>;
	aliases: readonly string[];
	context: TContext;
	io: ClinkrIo;
	state: RunState;
}

interface ConfigureCommandExecutionOptions<TContext> extends Omit<
	BuildLeafCommandOptions<TContext>,
	"aliases"
> {
	command: Command;
}

interface BuildCommandOptions<TContext> {
	context: TContext;
	io: ClinkrIo;
	state: RunState;
	isRoot: boolean;
}

const leafCommandMetadataSetters = [
	{ key: "description", apply: (command: Command, value: string) => command.description(value) },
	{ key: "summary", apply: (command: Command, value: string) => command.summary(value) },
	{ key: "helpGroup", apply: (command: Command, value: string) => command.helpGroup(value) },
] as const satisfies readonly {
	key: string;
	apply: (command: Command, value: string) => Command;
}[];

/**
 * @deprecated Migration-only mutable runtime. New code must use ClinkrApp builders.
 * Removed after direct consumers move to the immutable app runtime.
 */
export class LegacyClinkrGroup<TContext> {
	readonly name: string;
	readonly description: string | undefined;
	readonly helpGroup: string | undefined;
	readonly isHidden: boolean;
	readonly aliases: readonly string[];
	private readonly version: string | undefined;
	private readonly runtimeInfo: (() => string) | undefined;
	private readonly validateOutcomes: boolean;
	private registeredCommands: RegisteredCommand<TContext>[];
	private subgroups: LegacyClinkrGroup<TContext>[];
	private defaultRegisteredCommand: RegisteredCommand<TContext> | undefined;

	constructor(options: ClinkrGroupOptions) {
		this.name = options.name;
		this.description = options.description;
		this.helpGroup = options.helpGroup;
		this.isHidden = options.isHidden ?? false;
		this.aliases = Object.freeze([...(options.aliases ?? [])]);
		this.version = options.version;
		this.runtimeInfo = options.runtimeInfo;
		this.validateOutcomes = options.validateOutcomes ?? false;
		this.registeredCommands = [];
		this.subgroups = [];
		this.defaultRegisteredCommand = undefined;
	}

	command(spec: RawCommandSpec<TContext>): this;
	command<S extends z.ZodObject, TResult, TNegative, TFailure, TUsageError>(
		spec: ClinkrCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>,
	): this;
	command<S extends z.ZodObject, TResult, TNegative, TFailure, TUsageError>(
		spec:
			| ClinkrCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>
			| RawCommandSpec<TContext>,
	): this {
		const schema = spec.isRawExit === true ? z.object({}) : spec.schema;
		const plan = buildSurfacePlan({
			commandName: spec.name,
			schema,
			positionals: spec.isRawExit === true ? {} : (spec.positionals ?? {}),
			optionSpecs: spec.isRawExit === true ? {} : (spec.options ?? {}),
		});
		this.registeredCommands.push({
			name: spec.name,
			...optionalEntries({
				description: spec.description,
				summary: spec.summary,
				helpGroup: spec.helpGroup,
			}),
			aliases: Object.freeze([...(spec.aliases ?? [])]),
			isHidden: spec.isHidden ?? false,
			schema,
			...(spec.schemaDocument === undefined ? {} : { schemaDocument: spec.schemaDocument }),
			execution: executionOf(spec),
			plan,
			completionProvider: spec.completionProvider,
			shouldPassThrough: spec.isRawExit === true,
			validateOutcomes: this.validateOutcomes,
		});
		return this;
	}

	defaultCommand(spec: DefaultRawCommandSpec<TContext>): this;
	defaultCommand<S extends z.ZodObject, TResult, TNegative, TFailure, TUsageError>(
		spec: DefaultCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>,
	): this;
	defaultCommand<S extends z.ZodObject, TResult, TNegative, TFailure, TUsageError>(
		spec:
			| DefaultRawCommandSpec<TContext>
			| DefaultCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>,
	): this {
		if (this.defaultRegisteredCommand !== undefined) {
			throw new Error(`clinkr: group '${this.name}' already has a default command`);
		}
		const schema = spec.isRawExit === true ? z.object({}) : spec.schema;
		const plan = buildSurfacePlan({
			commandName: this.name,
			schema,
			positionals: spec.isRawExit === true ? {} : (spec.positionals ?? {}),
			optionSpecs: spec.isRawExit === true ? {} : (spec.options ?? {}),
		});
		this.defaultRegisteredCommand = {
			name: this.name,
			aliases: [],
			isHidden: false,
			schema,
			execution: executionOf(spec),
			plan,
			completionProvider: spec.completionProvider,
			shouldPassThrough: spec.isRawExit === true,
			validateOutcomes: this.validateOutcomes,
		};
		return this;
	}

	group(child: LegacyClinkrGroup<TContext>): this {
		this.subgroups.push(child);
		return this;
	}

	/**
	 * Migration-only lowering seam for composing an existing mutable group into
	 * the immutable app runtime. Remove when direct callers build routes natively.
	 */
	importLegacyClinkrGroupForMigration(source: LegacyClinkrGroup<TContext>): this {
		if (
			this.defaultRegisteredCommand !== undefined ||
			source.defaultRegisteredCommand === undefined
		) {
			if (
				this.defaultRegisteredCommand !== undefined &&
				source.defaultRegisteredCommand !== undefined
			) {
				throw new Error(`clinkr: group '${this.name}' already has a default command`);
			}
		} else {
			this.defaultRegisteredCommand = source.defaultRegisteredCommand;
		}
		this.registeredCommands.push(...source.registeredCommands);
		this.subgroups.push(...source.subgroups);
		return this;
	}

	/**
	 * Parse and dispatch. Returns the process exit code; never calls
	 * `process.exit`. Expected failures come back as codes; unexpected handler
	 * throws propagate raw (no envelope), matching Python clinkr crashes.
	 */
	/** Build static completion candidates without invoking command handlers. */
	complete(request: ClinkrCompletionRequest): ClinkrCompletionResult {
		return completeClinkrWords(this.buildCompletionPlan(true), request);
	}

	async completeAsync(
		request: ClinkrCompletionRequest,
		options: ClinkrCompleteAsyncOptions<TContext>,
	): Promise<ClinkrCompletionResult> {
		return await completeClinkrWordsAsync(this.buildCompletionPlan(true), request, options);
	}

	async run(argv: readonly string[], options: ClinkrRunOptions<TContext>): Promise<number> {
		const io = options.io ?? createProcessIo();
		const state: RunState = { exitCode: 0 };
		// A fresh commander tree per invocation: Command objects hold parse
		// state, so rebuilding keeps run() re-entrant.
		const program = this.buildCommand({ context: options.context, io, state, isRoot: true });
		if (this.runtimeInfo !== undefined && argv[0] === "--runtime") {
			io.stdout(this.runtimeInfo());
			return 0;
		}
		if (this.defaultRegisteredCommand?.execution.type === "raw" && argv[0] === "--help") {
			io.stdout(program.helpInformation());
			return 0;
		}
		const bareGroupPath = this.findBareGroupPath(argv);
		if (bareGroupPath !== undefined) {
			io.stdout(commandAtPath(program, bareGroupPath).helpInformation());
			return 0;
		}
		try {
			await program.parseAsync([...argv], { from: "user" });
			return state.exitCode;
		} catch (error) {
			if (error instanceof CommanderError) {
				const exitCode = exitCodeForCommanderError(error);
				if (exitCode === 2 && clinkrFormatFromArgs(argv) === "json") {
					emitUsageErrorJson(io, error.message, { commanderCode: error.code });
				}
				return exitCode;
			}
			throw error;
		}
	}

	private buildCompletionPlan(isRoot: boolean): ClinkrCompletionGroupPlan<TContext> {
		return {
			name: this.name,
			...optionalEntries({ aliases: aliasesOrUndefined(this.aliases) }),
			...(this.description === undefined ? {} : { description: this.description }),
			isRoot,
			isHidden: this.isHidden,
			hasVersionOption: this.version !== undefined,
			hasRuntimeOption: this.runtimeInfo !== undefined,
			commands: this.registeredCommands.map(completionNamedCommandPlan),
			groups: this.subgroups.map((child) => child.buildCompletionPlan(false)),
			...(this.defaultRegisteredCommand === undefined
				? {}
				: { defaultCommand: completionCommandPlan(this.defaultRegisteredCommand) }),
		};
	}

	private buildCommand(options: BuildCommandOptions<TContext>): Command {
		const { context, io, state, isRoot } = options;
		const command = createContainedCommand(this.name, io);
		if (this.description !== undefined) command.description(this.description);
		if (this.helpGroup !== undefined) command.helpGroup(this.helpGroup);
		if (isRoot && this.version !== undefined) {
			command.version(this.version, "-V, --version", "Show the package version.");
		}
		if (isRoot && this.runtimeInfo !== undefined) {
			command.addOption(new Option("--runtime", "Show CLI runtime diagnostics and exit."));
		}
		if (this.defaultRegisteredCommand !== undefined) {
			configureCommandExecution({
				command,
				registered: this.defaultRegisteredCommand,
				context,
				io,
				state,
			});
		}
		for (const registered of this.registeredCommands) {
			command.addCommand(
				buildLeafCommand({
					registered,
					aliases: registered.aliases,
					context,
					io,
					state,
				}),
				{ hidden: registered.isHidden },
			);
		}
		for (const child of this.subgroups) {
			const childCommand = child.buildCommand({ context, io, state, isRoot: false });
			for (const alias of child.aliases) {
				childCommand.alias(alias);
			}
			command.addCommand(childCommand, {
				hidden: child.isHidden,
			});
		}
		return command;
	}

	private findBareGroupPath(argv: readonly string[]): string[] | undefined {
		if (argv.length === 0) return this.defaultRegisteredCommand === undefined ? [] : undefined;
		const [head, ...tail] = argv;
		if (head === undefined) return [];
		const child = this.subgroups.find(
			(candidate) => candidate.name === head || candidate.aliases.includes(head),
		);
		if (child === undefined) return undefined;
		const childPath = child.findBareGroupPath(tail);
		if (childPath === undefined) return undefined;
		return [child.name, ...childPath];
	}
}

function executionOf<TContext, S extends z.ZodObject, TResult, TNegative, TFailure, TUsageError>(
	spec:
		| ClinkrCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>
		| RawCommandSpec<TContext>
		| DefaultCommandSpec<TContext, S, TResult, TNegative, TFailure, TUsageError>
		| DefaultRawCommandSpec<TContext>,
): RenderedExecution<TContext> | RawExecution<TContext> {
	if (spec.isRawExit === true) return rawExecutionOf(spec);
	return {
		type: "rendered",
		outcomeSchemas: {
			...(spec.resultSchema === undefined ? {} : { resultSchema: spec.resultSchema }),
			...(spec.negativeSchema === undefined ? {} : { negativeSchema: spec.negativeSchema }),
			...(spec.failureSchema === undefined ? {} : { failureSchema: spec.failureSchema }),
			...(spec.usageErrorSchema === undefined ? {} : { usageErrorSchema: spec.usageErrorSchema }),
		},
		// Erase the command generics once; zod re-establishes the request shape
		// at parse time, so the cast is backed by a runtime guarantee.
		handler: spec.handler as (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>,
		renderHuman: spec.renderHuman as
			| ((data: unknown, caps: RenderCapabilities) => string)
			| undefined,
		renderMarkdown: spec.renderMarkdown as
			| ((data: unknown, caps: RenderCapabilities) => string)
			| undefined,
	};
}

function completionNamedCommandPlan<TContext>(
	registered: RegisteredCommand<TContext>,
): ClinkrCompletionCommandPlan<TContext> {
	return {
		...completionCommandPlan(registered),
		...optionalEntries({ aliases: aliasesOrUndefined(registered.aliases) }),
	};
}

function completionCommandPlan<TContext>(
	registered: RegisteredCommand<TContext>,
): ClinkrCompletionCommandPlan<TContext> {
	const frameworkOptions =
		registered.execution.type === "rendered"
			? [...CLINKR_RENDERED_COMMAND_OPTIONS, CLINKR_JSON_SCHEMA_OPTION]
			: [];
	return {
		name: registered.name,
		...(registered.summary === undefined && registered.description === undefined
			? {}
			: { description: registered.summary ?? registered.description }),
		isHidden: registered.isHidden,
		options: [
			...registered.plan.options.map((option) => completionOptionFromSurface(option)),
			...frameworkOptions,
		],
		positionals: registered.plan.positionals,
		...(registered.completionProvider === undefined
			? {}
			: { completionProvider: registered.completionProvider }),
		...(registered.shouldPassThrough ? { shouldPassThrough: true } : {}),
	};
}

function rawExecutionOf<TContext>(
	spec: Pick<RawCommandSpec<TContext>, "run">,
): RawExecution<TContext> {
	return { type: "raw", run: spec.run };
}

function assertNever(value: never): never {
	throw new Error(`clinkr: unexpected execution type ${JSON.stringify(value)}`);
}

function aliasesOrUndefined(aliases: readonly string[]): readonly string[] | undefined {
	return aliases.length === 0 ? undefined : aliases;
}

function commandAtPath(program: Command, path: readonly string[]): Command {
	let current = program;
	for (const name of path) {
		const child = current.commands.find((candidate) => candidate.name() === name);
		if (child === undefined)
			throw new Error(`clinkr: built command tree is missing group '${name}'`);
		current = child;
	}
	return current;
}

function createContainedCommand(name: string, io: ClinkrIo): Command {
	const command = new Command(name);
	command.exitOverride();
	command.addHelpCommand(false);
	command.configureOutput({
		writeOut: (text) => {
			io.stdout(text);
		},
		writeErr: (text) => {
			io.stderr(text);
		},
	});
	return command;
}

function exitCodeForCommanderError(error: CommanderError): number {
	if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
		return 0;
	}
	// All parse/usage errors exit 2 (Click parity; commander defaults to 1).
	return 2;
}

function emitUsageErrorJson(io: ClinkrIo, message: string, data: unknown): void {
	io.stdout(`${envelopeJsonText(usageErrorMachineEnvelope(message, data))}\n`);
}

function buildLeafCommand<TContext>(options: BuildLeafCommandOptions<TContext>): Command {
	const { registered, aliases, io } = options;
	const command = createContainedCommand(registered.name, io);
	for (const alias of aliases) command.alias(alias);
	for (const { key, apply } of leafCommandMetadataSetters) {
		const value = registered[key];
		if (value !== undefined) apply(command, value);
	}
	configureCommandExecution({ command, ...options });
	return command;
}

function configureCommandExecution<TContext>(
	options: ConfigureCommandExecutionOptions<TContext>,
): void {
	const { command, registered, context, io, state } = options;
	if (registered.shouldPassThrough) {
		command.helpOption(false);
		command.allowUnknownOption(true);
		command.allowExcessArguments(true);
	}
	for (const positional of registered.plan.positionals) {
		command.addArgument(buildCommanderArgument(positional));
	}
	if (registered.plan.positionals.length > 0) {
		const parts = registered.plan.positionals.map((positional) => {
			const name = positional.isVariadic ? `${positional.name}...` : positional.name;
			return positional.isRequired ? `<${name}>` : `[${name}]`;
		});
		command.usage(`[options] ${parts.join(" ")}`);
	}
	for (const optionPlan of registered.plan.options) {
		command.addOption(buildCommanderOption(optionPlan));
	}
	if (!registered.shouldPassThrough && registered.execution.type === "rendered") {
		command.addOption(
			new Option("--format <format>", "Output format.")
				.choices(["human", "json", "markdown", "md"])
				.default("human"),
		);
	}
	if (!registered.shouldPassThrough) {
		command.addOption(
			new Option(
				"--json-schema",
				"Print the JSON Schema for this command's input/output and exit.",
			),
		);
	}
	command.action(async (...actionArgs: unknown[]) => {
		const opts = command.opts<Record<string, unknown>>();
		if (registered.execution.type === "raw") {
			state.exitCode = await registered.execution.run(context, {
				argv: Object.freeze([...command.args]),
				io,
			});
			return;
		}
		// Eager like --help: schema printing happens before required-argument
		// validation, which lives entirely in zod below.
		if (opts["jsonSchema"] === true) {
			const outcomeSchemas =
				registered.execution.type === "rendered" ? registered.execution.outcomeSchemas : {};
			const document =
				registered.schemaDocument?.() ?? buildJsonSchemaDocument(registered.schema, outcomeSchemas);
			io.stdout(`${JSON.stringify(document, null, 2)}\n`);
			state.exitCode = 0;
			return;
		}
		const raw: Record<string, unknown> = {};
		registered.plan.positionals.forEach((positional, index) => {
			const value = actionArgs[index];
			if (value !== undefined) raw[positional.key] = value;
		});
		for (const optionPlan of registered.plan.options) {
			const value = opts[optionPlan.attributeName];
			if (value !== undefined) raw[optionPlan.key] = value;
		}
		const parsed = registered.schema.safeParse(raw);
		if (!parsed.success) {
			const message = formatUsageError(parsed.error, registered.plan).trimEnd();
			if (
				registered.execution.type === "rendered" &&
				clinkrFormatFromOption(opts["format"]) === "json"
			) {
				emitUsageErrorJson(io, message, {
					issues: parsed.error.issues.map((issue) => usageIssueData(registered.plan, issue)),
				});
				state.exitCode = 2;
				return;
			}
			io.stderr(`${message}\n`);
			state.exitCode = 2;
			return;
		}
		switch (registered.execution.type) {
			case "rendered": {
				const format = clinkrFormatFromOption(opts["format"]);
				const handled = await registered.execution.handler(context, parsed.data);
				const exit = registered.validateOutcomes
					? validateOutcomeData(handled, registered.execution.outcomeSchemas)
					: handled;
				state.exitCode = emitExit(exit, {
					format,
					io,
					...(registered.execution.renderHuman === undefined
						? {}
						: { renderHuman: registered.execution.renderHuman }),
					...(registered.execution.renderMarkdown === undefined
						? {}
						: { renderMarkdown: registered.execution.renderMarkdown }),
				});
				return;
			}
			default:
				assertNever(registered.execution);
		}
	});
}

function buildCommanderArgument(plan: PositionalPlan): Argument {
	// Declared bracket-optional so commander never enforces requiredness: zod
	// owns it, keeping the usage-error channel uniform and --json-schema eager.
	const name = plan.isVariadic ? `[${plan.name}...]` : `[${plan.name}]`;
	const argument = new Argument(name, plan.description);
	if (plan.kind.type === "number") argument.argParser(parseNumberValue);
	if (plan.kind.type === "integer") argument.argParser(parseIntegerValue);
	if (plan.kind.type === "enum") argument.choices([...plan.kind.values]);
	return argument;
}

function buildCommanderOption(plan: OptionPlan): Option {
	const option = new Option(plan.flag, plan.description === "" ? undefined : plan.description);
	switch (plan.kind.type) {
		case "number":
			option.argParser(parseNumberValue);
			break;
		case "integer":
			option.argParser(parseIntegerValue);
			break;
		case "enum":
			option.choices([...plan.kind.values]);
			break;
		case "string-array":
			option.argParser(accumulateValue);
			break;
		case "string":
		case "boolean":
			break;
	}
	return option;
}

function parseNumberValue(value: string): number {
	const parsed = Number(value);
	if (value.trim() === "" || Number.isNaN(parsed)) {
		throw new InvalidArgumentError("expected a number");
	}
	return parsed;
}

function parseIntegerValue(value: string): number {
	const parsed = parseStrictInteger(value);
	if (parsed === null) {
		throw new InvalidArgumentError("expected an integer");
	}
	return parsed;
}

function parseStrictInteger(value: string): number | null {
	// This parser is intentionally stricter than click-style coercion: decimal digits only,
	// no leading +, no whitespace, no underscores. Callers that need parity with a prior
	// command face should arbitrate that compatibility in the owning package.
	if (!/^-?\d+$/.test(value)) return null;
	return Number(value);
}

function accumulateValue(value: string, previous: string[] | undefined): string[] {
	return [...(previous ?? []), value];
}

function formatUsageError(error: z.ZodError, plan: SurfacePlan): string {
	const lines = error.issues.map((issue) => {
		const surface = surfaceNameForIssue(plan, issue);
		return surface === undefined
			? `error: ${issue.message}`
			: `error: ${surface}: ${issue.message}`;
	});
	return `${lines.join("\n")}\n`;
}

function usageIssueData(plan: SurfacePlan, issue: z.core.$ZodIssue): Record<string, unknown> {
	return {
		path: issue.path,
		message: issue.message,
		code: issue.code,
		...(surfaceNameForIssue(plan, issue) === undefined
			? {}
			: { surface: surfaceNameForIssue(plan, issue) }),
	};
}

function surfaceNameForIssue(plan: SurfacePlan, issue: z.core.$ZodIssue): string | undefined {
	const key = issue.path[0];
	if (typeof key !== "string") return undefined;
	const positional = plan.positionals.find((candidate) => candidate.key === key);
	if (positional !== undefined) return positional.name;
	const option = plan.options.find((candidate) => candidate.key === key);
	if (option !== undefined) return flagNameOf(option);
	return undefined;
}

function flagNameOf(option: OptionPlan): string {
	const [name] = option.flag.split(" ");
	return name ?? option.flag;
}
