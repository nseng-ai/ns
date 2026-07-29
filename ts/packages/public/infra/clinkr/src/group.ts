import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { Command, CommanderError, Option } from "commander";
import { z } from "zod";

import { buildCommanderArgument, buildCommanderOption } from "./commander-surface.ts";
import type {
	ClinkrCompletionCandidate,
	ClinkrCompletionRequest,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionProvider,
} from "./completion.ts";
import {
	CLINKR_HELP_OPTIONS,
	CLINKR_JSON_SCHEMA_OPTION,
	CLINKR_RENDERED_COMMAND_OPTIONS,
	CLINKR_RUNTIME_OPTION,
	CLINKR_VERSION_OPTION,
	completeOptionNames,
	completeStructuredCommand,
	completionOptionFromSurface,
	dedupeCompletionCandidates,
	normalizeCompletionCandidates,
	type ClinkrCompletionOptionPlan,
} from "./completion-support.ts";
import {
	ClinkrFailure,
	clinkrFormatFromArgs,
	clinkrFormatFromOption,
	emitExit,
	envelopeJsonText,
	usageErrorMachineEnvelope,
	type ClinkrExit,
	type RenderCapabilities,
} from "@nseng-ai/clinkr/legacy";
import { createProcessIo, type ClinkrIo } from "./io.ts";
import { buildJsonSchemaDocument, type JsonSchemaDocument } from "@nseng-ai/clinkr/legacy";
import {
	buildSurfacePlan,
	type OptionPlan,
	type OptionSpec,
	type PositionalSpec,
	type SurfacePlan,
} from "./surface.ts";

export type ClinkrHandler<TContext, S extends z.ZodObject, T> = (
	ctx: TContext,
	request: z.output<S>,
) => Promise<ClinkrExit<T>>;

export interface ClinkrCommandSpec<TContext, S extends z.ZodObject, T> {
	name: string;
	description?: string;
	/** Short summary for parent help lists; omitted from leaf command help body. */
	summary?: string;
	/** Parent help section heading for this command. */
	helpGroup?: string;
	schema: S;
	handler: ClinkrHandler<TContext, S, T>;
	/** Source of `output_json_schema` for `--json-schema`; `{}` when absent. */
	resultSchema?: z.ZodType<T>;
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
	renderHuman?: (data: T, caps: RenderCapabilities) => string;
	/** Markdown rendering for the ok variant; falls back to human rendering when absent. */
	renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	/** Rendered commands cannot opt into raw mode; use `@nseng-ai/clinkr/raw`. */
	isRawExit?: never;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
}

export interface RawCommandSpec<TContext, S extends z.ZodObject> {
	name: string;
	description?: string;
	/** Short summary for parent help lists; omitted from leaf command help body. */
	summary?: string;
	/** Parent help section heading for this command. */
	helpGroup?: string;
	schema: S;
	isRawExit: true;
	/** Pass all tokens through to the raw handler, including framework-looking options. */
	shouldPassThrough?: true;
	run: (ctx: TContext, request: z.output<S>) => Promise<number>;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	completionProvider?: ClinkrDynamicCompletionProvider<TContext>;
	handler?: never;
	resultSchema?: never;
	renderHuman?: never;
	renderMarkdown?: never;
	schemaDocument?: never;
}

export interface DefaultRawCommandSpec<TContext, S extends z.ZodObject> extends Omit<
	RawCommandSpec<TContext, S>,
	"name" | "summary" | "description"
> {
	name?: never;
	summary?: never;
	description?: never;
}

export interface DefaultCommandSpec<TContext, S extends z.ZodObject, T> extends Omit<
	ClinkrCommandSpec<TContext, S, T>,
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
	/** Root-only package version exposed as `-V, --version`. */
	version?: string;
	/** Root-only runtime diagnostic text exposed as `--runtime`. */
	runtimeInfo?: () => string;
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
	schema: z.ZodObject;
	schemaDocument?: () => JsonSchemaDocument;
	execution: RenderedExecution<TContext> | RawExecution<TContext>;
	plan: SurfacePlan;
	completionProvider: ClinkrDynamicCompletionProvider<TContext> | undefined;
	shouldPassThrough: boolean;
}

interface RenderedExecution<TContext> {
	type: "rendered";
	resultSchema: z.ZodType | undefined;
	handler: (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>;
	renderHuman: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
	renderMarkdown: ((data: unknown, caps: RenderCapabilities) => string) | undefined;
}

interface RawExecution<TContext> {
	type: "raw";
	run: (ctx: TContext, request: unknown) => Promise<number>;
}

interface RunState {
	exitCode: number;
}

interface LegacyCompletionResolution<TContext> {
	readonly command: RegisteredCommand<TContext> | undefined;
	readonly args: readonly string[];
	readonly current: string;
	readonly previous: readonly string[];
	readonly candidates: readonly ClinkrCompletionCandidate[];
	readonly positionalIndex: number;
	readonly providerEligible: boolean;
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

const LIST_COMMAND_NAME = "list";
const LIST_COMMAND_ALIAS = "ls";

export class ClinkrGroup<TContext> {
	readonly name: string;
	readonly description: string | undefined;
	readonly helpGroup: string | undefined;
	readonly isHidden: boolean;
	private readonly version: string | undefined;
	private readonly runtimeInfo: (() => string) | undefined;
	private registeredCommands: RegisteredCommand<TContext>[];
	private subgroups: ClinkrGroup<TContext>[];
	private defaultRegisteredCommand: RegisteredCommand<TContext> | undefined;

	constructor(options: ClinkrGroupOptions) {
		this.name = options.name;
		this.description = options.description;
		this.helpGroup = options.helpGroup;
		this.isHidden = options.isHidden ?? false;
		this.version = options.version;
		this.runtimeInfo = options.runtimeInfo;
		this.registeredCommands = [];
		this.subgroups = [];
		this.defaultRegisteredCommand = undefined;
	}

	command<S extends z.ZodObject>(spec: RawCommandSpec<TContext, S>): this;
	command<S extends z.ZodObject, T>(spec: ClinkrCommandSpec<TContext, S, T>): this;
	command<S extends z.ZodObject, T>(
		spec: ClinkrCommandSpec<TContext, S, T> | RawCommandSpec<TContext, S>,
	): this {
		const plan = buildSurfacePlan({
			commandName: spec.name,
			schema: spec.schema,
			positionals: spec.positionals ?? {},
			optionSpecs: spec.options ?? {},
		});
		this.registeredCommands.push({
			name: spec.name,
			...optionalEntries({
				description: spec.description,
				summary: spec.summary,
				helpGroup: spec.helpGroup,
			}),
			schema: spec.schema,
			...(spec.schemaDocument === undefined ? {} : { schemaDocument: spec.schemaDocument }),
			execution: executionOf(spec),
			plan,
			completionProvider: spec.completionProvider,
			shouldPassThrough: shouldPassThroughOf(spec),
		});
		return this;
	}

	defaultCommand<S extends z.ZodObject>(spec: DefaultRawCommandSpec<TContext, S>): this;
	defaultCommand<S extends z.ZodObject, T>(spec: DefaultCommandSpec<TContext, S, T>): this;
	defaultCommand<S extends z.ZodObject, T>(
		spec: DefaultRawCommandSpec<TContext, S> | DefaultCommandSpec<TContext, S, T>,
	): this {
		if (this.defaultRegisteredCommand !== undefined) {
			throw new Error(`clinkr: group '${this.name}' already has a default command`);
		}
		const plan = buildSurfacePlan({
			commandName: this.name,
			schema: spec.schema,
			positionals: spec.positionals ?? {},
			optionSpecs: spec.options ?? {},
		});
		this.defaultRegisteredCommand = {
			name: this.name,
			schema: spec.schema,
			execution: executionOf(spec),
			plan,
			completionProvider: spec.completionProvider,
			shouldPassThrough: shouldPassThroughOf(spec),
		};
		return this;
	}

	group(child: ClinkrGroup<TContext>): this {
		this.subgroups.push(child);
		return this;
	}

	/**
	 * Parse and dispatch. Returns the process exit code; never calls
	 * `process.exit`. Expected failures come back as codes; unexpected handler
	 * throws propagate raw (no envelope), matching Python clinkr crashes.
	 */
	/** Build static completion candidates without invoking command handlers. */
	complete(request: ClinkrCompletionRequest): ClinkrCompletionResult {
		const resolution = this.resolveCompletion(request);
		return { candidates: dedupeCompletionCandidates(resolution.candidates) };
	}

	async completeAsync(
		request: ClinkrCompletionRequest,
		options: ClinkrCompleteAsyncOptions<TContext>,
	): Promise<ClinkrCompletionResult> {
		const resolution = this.resolveCompletion(request);
		const provider = resolution.command?.completionProvider;
		if (provider === undefined || !resolution.providerEligible) {
			return { candidates: dedupeCompletionCandidates(resolution.candidates) };
		}
		try {
			const dynamic = await provider(options.context, {
				...request,
				current: resolution.current,
				previous: resolution.previous,
				args: resolution.args,
				positionalIndex: resolution.positionalIndex,
			});
			return {
				candidates: dedupeCompletionCandidates([
					...resolution.candidates,
					...normalizeCompletionCandidates(dynamic),
				]),
			};
		} catch (error) {
			options.onDynamicCompletionError?.(error);
			return { candidates: dedupeCompletionCandidates(resolution.candidates) };
		}
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

	private resolveCompletion(
		request: ClinkrCompletionRequest,
	): LegacyCompletionResolution<TContext> {
		const current = request.words.at(-1) ?? "";
		const previous = request.words.length === 0 ? [] : request.words.slice(0, -1);
		return this.resolveCompletionAt(previous, current, previous, true);
	}

	private resolveCompletionAt(
		words: readonly string[],
		current: string,
		previous: readonly string[],
		isRoot: boolean,
	): LegacyCompletionResolution<TContext> {
		const word = words[0];
		if (word === undefined || word === "") {
			return this.completeGroup(words, current, isRoot, previous);
		}
		const siblingNames = this.siblingNames();
		const child = this.subgroups.find((candidate) =>
			clinkrNameMatchesAutomaticAlias(candidate.name, siblingNames, word),
		);
		if (child !== undefined) {
			return child.resolveCompletionAt(words.slice(1), current, previous, false);
		}
		const command = this.registeredCommands.find((candidate) =>
			clinkrNameMatchesAutomaticAlias(candidate.name, siblingNames, word),
		);
		if (command !== undefined) {
			return completeRegisteredCommand(command, words.slice(1), current, previous);
		}
		if (this.defaultRegisteredCommand !== undefined) {
			return completeRegisteredCommand(this.defaultRegisteredCommand, words, current, previous);
		}
		return this.completeGroup(words, current, isRoot, previous);
	}

	private completeGroup(
		args: readonly string[],
		current: string,
		isRoot: boolean,
		previous: readonly string[],
	): LegacyCompletionResolution<TContext> {
		const defaultCommand = this.defaultRegisteredCommand;
		const defaultOptions = defaultCommand === undefined ? [] : completionOptions(defaultCommand);
		const options = [
			...CLINKR_HELP_OPTIONS,
			...(isRoot && this.version !== undefined ? [CLINKR_VERSION_OPTION] : []),
			...(isRoot && this.runtimeInfo !== undefined ? [CLINKR_RUNTIME_OPTION] : []),
			...defaultOptions,
		];
		if (current.startsWith("-")) {
			return {
				command: undefined,
				args,
				current,
				previous,
				candidates: completeOptionNames(options, current),
				positionalIndex: 0,
				providerEligible: false,
			};
		}
		const siblingNames = this.siblingNames();
		const commandCandidates = [
			...this.registeredCommands.flatMap((command) =>
				completionNameCandidates(
					command.name,
					clinkrAutomaticAliasesForName(command.name, siblingNames),
					command.summary ?? command.description,
				),
			),
			...this.subgroups
				.filter((child) => !child.isHidden)
				.flatMap((child) =>
					completionNameCandidates(
						child.name,
						clinkrAutomaticAliasesForName(child.name, siblingNames),
						child.description,
					),
				),
		].filter((candidate) => candidate.value.startsWith(current));
		if (defaultCommand === undefined) {
			return {
				command: undefined,
				args,
				current,
				previous,
				candidates: commandCandidates,
				positionalIndex: 0,
				providerEligible: false,
			};
		}
		const structured = completeStructuredCommand({
			options: defaultOptions,
			positionals: defaultCommand.plan.positionals,
			previous: [],
			current,
			providerCompletesOptionValues: false,
			providerPassesThroughOptions: defaultCommand.shouldPassThrough,
		});
		return {
			command: undefined,
			args,
			current,
			previous,
			candidates: [...commandCandidates, ...structured.candidates],
			positionalIndex: structured.positionalIndex,
			providerEligible: false,
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
		const siblingNames = this.siblingNames();
		for (const registered of this.registeredCommands) {
			command.addCommand(
				buildLeafCommand({
					registered,
					aliases: clinkrAutomaticAliasesForName(registered.name, siblingNames) ?? [],
					context,
					io,
					state,
				}),
			);
		}
		for (const child of this.subgroups) {
			const childCommand = child.buildCommand({ context, io, state, isRoot: false });
			for (const alias of clinkrAutomaticAliasesForName(child.name, siblingNames) ?? []) {
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
		const siblingNames = this.siblingNames();
		const child = this.subgroups.find((candidate) =>
			clinkrNameMatchesAutomaticAlias(candidate.name, siblingNames, head),
		);
		if (child === undefined) return undefined;
		const childPath = child.findBareGroupPath(tail);
		if (childPath === undefined) return undefined;
		return [child.name, ...childPath];
	}

	private siblingNames(): ReadonlySet<string> {
		return new Set([
			...this.registeredCommands.map((registered) => registered.name),
			...this.subgroups.map((child) => child.name),
		]);
	}
}

function executionOf<TContext, S extends z.ZodObject, T>(
	spec:
		| ClinkrCommandSpec<TContext, S, T>
		| RawCommandSpec<TContext, S>
		| DefaultCommandSpec<TContext, S, T>
		| DefaultRawCommandSpec<TContext, S>,
): RenderedExecution<TContext> | RawExecution<TContext> {
	if (spec.isRawExit === true) return rawExecutionOf(spec);
	return {
		type: "rendered",
		resultSchema: spec.resultSchema,
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

function shouldPassThroughOf<TContext, S extends z.ZodObject, T>(
	spec:
		| ClinkrCommandSpec<TContext, S, T>
		| RawCommandSpec<TContext, S>
		| DefaultCommandSpec<TContext, S, T>
		| DefaultRawCommandSpec<TContext, S>,
): boolean {
	return spec.isRawExit === true && spec.shouldPassThrough === true;
}

function completeRegisteredCommand<TContext>(
	command: RegisteredCommand<TContext>,
	args: readonly string[],
	current: string,
	previous: readonly string[],
): LegacyCompletionResolution<TContext> {
	const structured = completeStructuredCommand({
		options: completionOptions(command),
		positionals: command.plan.positionals,
		previous: args,
		current,
		providerCompletesOptionValues: false,
		providerPassesThroughOptions: command.shouldPassThrough,
	});
	return {
		command,
		args,
		current,
		previous,
		candidates: structured.candidates,
		positionalIndex: structured.positionalIndex,
		providerEligible: structured.providerEligible,
	};
}

function completionOptions<TContext>(
	registered: RegisteredCommand<TContext>,
): readonly ClinkrCompletionOptionPlan[] {
	const frameworkOptions =
		registered.execution.type === "rendered"
			? [...CLINKR_RENDERED_COMMAND_OPTIONS, CLINKR_JSON_SCHEMA_OPTION]
			: [CLINKR_JSON_SCHEMA_OPTION];
	return [
		...CLINKR_HELP_OPTIONS,
		...registered.plan.options.map((option) => completionOptionFromSurface(option)),
		...frameworkOptions,
	];
}

function completionNameCandidates(
	name: string,
	aliases: readonly string[] | undefined,
	description: string | undefined,
): readonly ClinkrCompletionCandidate[] {
	return [name, ...(aliases ?? [])].map((value) => ({
		value,
		type: "command",
		...(description === undefined || description === "" ? {} : { description }),
	}));
}

function rawExecutionOf<TContext, S extends z.ZodObject>(
	spec: Pick<RawCommandSpec<TContext, S>, "run">,
): RawExecution<TContext> {
	return {
		type: "raw",
		// Erase the command generics once; zod re-establishes the request shape
		// at parse time, so the cast is backed by a runtime guarantee.
		run: spec.run as (ctx: TContext, request: unknown) => Promise<number>,
	};
}

function assertNever(value: never): never {
	throw new Error(`clinkr: unexpected execution type ${JSON.stringify(value)}`);
}

export function clinkrAutomaticAliasesForName(
	name: string,
	siblingNames: ReadonlySet<string>,
): readonly string[] | undefined {
	if (name !== LIST_COMMAND_NAME || siblingNames.has(LIST_COMMAND_ALIAS)) return undefined;
	return [LIST_COMMAND_ALIAS];
}

export function clinkrNameMatchesAutomaticAlias(
	name: string,
	siblingNames: ReadonlySet<string>,
	word: string,
): boolean {
	return (
		name === word || clinkrAutomaticAliasesForName(name, siblingNames)?.includes(word) === true
	);
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
	}
	for (const positional of registered.plan.positionals) {
		command.addArgument(buildCommanderArgument(positional, { requiredness: "schema" }));
	}
	if (registered.plan.positionals.length > 0) {
		const parts = registered.plan.positionals.map((positional) => {
			const name = positional.isVariadic ? `${positional.name}...` : positional.name;
			return positional.isRequired ? `<${name}>` : `[${name}]`;
		});
		command.usage(`[options] ${parts.join(" ")}`);
	}
	for (const optionPlan of registered.plan.options) {
		command.addOption(buildCommanderOption(optionPlan, { applyDefault: false }));
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
		// Eager like --help: schema printing happens before required-argument
		// validation, which lives entirely in zod below.
		if (opts["jsonSchema"] === true) {
			const resultSchema =
				registered.execution.type === "rendered" ? registered.execution.resultSchema : undefined;
			const document =
				registered.schemaDocument?.() ?? buildJsonSchemaDocument(registered.schema, resultSchema);
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
			case "raw":
				try {
					state.exitCode = await registered.execution.run(context, parsed.data);
				} catch (error) {
					if (!(error instanceof ClinkrFailure)) throw error;
					state.exitCode = emitExit(
						{
							type: "failure",
							errorType: error.errorType,
							message: error.message,
							...(error.data === undefined ? {} : { data: error.data }),
						},
						{ format: "human", io },
					);
				}
				return;
			case "rendered": {
				const format = clinkrFormatFromOption(opts["format"]);
				let exit: ClinkrExit<unknown>;
				try {
					exit = await registered.execution.handler(context, parsed.data);
				} catch (error) {
					if (!(error instanceof ClinkrFailure)) throw error;
					exit = {
						type: "failure",
						errorType: error.errorType,
						message: error.message,
						...(error.data === undefined ? {} : { data: error.data }),
					};
				}
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
