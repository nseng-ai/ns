import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { z } from "zod";

import { emitExit, type LegacyMachineOutput } from "./emit.ts";
import type { ClinkrExit } from "./exit.ts";
import { clinkrFormatFromOption } from "./format.ts";
import { ClinkrFailure } from "./failure.ts";
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

export type ClinkrHandler<TContext, S extends z.ZodObject, T> = (
	ctx: TContext,
	request: z.output<S>,
) => Promise<ClinkrExit<T>>;

export interface ClinkrCommandSpec<TContext, S extends z.ZodObject, T> {
	name: string;
	description?: string;
	/** Short summary for parent help lists; omitted from leaf command help body. */
	summary?: string;
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
	/** Human rendering for the ok variant; default is indented JSON of the data. */
	renderHuman?: (data: T) => string;
	/** Markdown rendering for the ok variant; falls back to human rendering when absent. */
	renderMarkdown?: (data: T) => string;
	/**
	 * Deprecated-from-birth escape hatch: routes the whole exit union through a
	 * legacy machine shape under `--format json` so migrated commands keep their
	 * pre-clinkr output contract. Kill tracked in the umbrella migration-debt
	 * ledger.
	 */
	legacyMachine?: (exit: ClinkrExit<T>) => LegacyMachineOutput;
	/** Rendered commands cannot opt into raw mode; use `@asdl/clinkr/raw`. */
	isRawExit?: never;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
}

export interface RawCommandSpec<TContext, S extends z.ZodObject> {
	name: string;
	description?: string;
	/** Short summary for parent help lists; omitted from leaf command help body. */
	summary?: string;
	schema: S;
	isRawExit: true;
	run: (ctx: TContext, request: z.output<S>) => Promise<number>;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	handler?: never;
	resultSchema?: never;
	renderHuman?: never;
	renderMarkdown?: never;
	legacyMachine?: never;
	schemaDocument?: never;
}

export interface ClinkrGroupOptions {
	name: string;
	description?: string;
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

interface RegisteredCommand<TContext> {
	name: string;
	description: string | undefined;
	summary: string | undefined;
	schema: z.ZodObject;
	schemaDocument: (() => JsonSchemaDocument) | undefined;
	execution: RenderedExecution<TContext> | RawExecution<TContext>;
	plan: SurfacePlan;
}

interface RenderedExecution<TContext> {
	type: "rendered";
	resultSchema: z.ZodType | undefined;
	handler: (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>;
	renderHuman: ((data: unknown) => string) | undefined;
	renderMarkdown: ((data: unknown) => string) | undefined;
	legacyMachine: ((exit: ClinkrExit<unknown>) => LegacyMachineOutput) | undefined;
}

interface RawExecution<TContext> {
	type: "raw";
	run: (ctx: TContext, request: unknown) => Promise<number>;
}

interface RunState {
	exitCode: number;
}

interface BuildLeafCommandOptions<TContext> {
	registered: RegisteredCommand<TContext>;
	context: TContext;
	io: ClinkrIo;
	state: RunState;
}

interface BuildCommandOptions<TContext> {
	context: TContext;
	io: ClinkrIo;
	state: RunState;
	isRoot: boolean;
}

export class ClinkrGroup<TContext> {
	readonly name: string;
	readonly description: string | undefined;
	readonly isHidden: boolean;
	private readonly version: string | undefined;
	private readonly runtimeInfo: (() => string) | undefined;
	private registeredCommands: RegisteredCommand<TContext>[];
	private subgroups: ClinkrGroup<TContext>[];

	constructor(options: ClinkrGroupOptions) {
		this.name = options.name;
		this.description = options.description;
		this.isHidden = options.isHidden ?? false;
		this.version = options.version;
		this.runtimeInfo = options.runtimeInfo;
		this.registeredCommands = [];
		this.subgroups = [];
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
			description: spec.description,
			summary: spec.summary,
			schema: spec.schema,
			schemaDocument: spec.schemaDocument,
			execution: executionOf(spec),
			plan,
		});
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
				return exitCodeForCommanderError(error);
			}
			throw error;
		}
	}

	private buildCommand(options: BuildCommandOptions<TContext>): Command {
		const { context, io, state, isRoot } = options;
		const command = createContainedCommand(this.name, io);
		if (this.description !== undefined) command.description(this.description);
		if (isRoot && this.version !== undefined) {
			command.version(this.version, "-V, --version", "Show the package version.");
		}
		if (isRoot && this.runtimeInfo !== undefined) {
			command.addOption(new Option("--runtime", "Show CLI runtime diagnostics and exit."));
		}
		for (const registered of this.registeredCommands) {
			command.addCommand(buildLeafCommand({ registered, context, io, state }));
		}
		for (const child of this.subgroups) {
			command.addCommand(child.buildCommand({ context, io, state, isRoot: false }), { hidden: child.isHidden });
		}
		return command;
	}

	private findBareGroupPath(argv: readonly string[]): string[] | undefined {
		if (argv.length === 0) return [];
		const [head, ...tail] = argv;
		if (head === undefined) return [];
		const child = this.subgroups.find((candidate) => candidate.name === head);
		if (child === undefined) return undefined;
		const childPath = child.findBareGroupPath(tail);
		if (childPath === undefined) return undefined;
		return [head, ...childPath];
	}
}

function executionOf<TContext, S extends z.ZodObject, T>(
	spec: ClinkrCommandSpec<TContext, S, T> | RawCommandSpec<TContext, S>,
): RenderedExecution<TContext> | RawExecution<TContext> {
	if (spec.isRawExit === true) {
		return {
			type: "raw",
			// Erase the command generics once; zod re-establishes the request shape
			// at parse time, so the cast is backed by a runtime guarantee.
			run: spec.run as (ctx: TContext, request: unknown) => Promise<number>,
		};
	}
	return {
		type: "rendered",
		resultSchema: spec.resultSchema,
		// Erase the command generics once; zod re-establishes the request shape
		// at parse time, so the cast is backed by a runtime guarantee.
		handler: spec.handler as (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>,
		renderHuman: spec.renderHuman as ((data: unknown) => string) | undefined,
		renderMarkdown: spec.renderMarkdown as ((data: unknown) => string) | undefined,
		legacyMachine: spec.legacyMachine as ((exit: ClinkrExit<unknown>) => LegacyMachineOutput) | undefined,
	};
}

function assertNever(value: never): never {
	throw new Error(`clinkr: unexpected execution type ${JSON.stringify(value)}`);
}

function commandAtPath(program: Command, path: readonly string[]): Command {
	let current = program;
	for (const name of path) {
		const child = current.commands.find((candidate) => candidate.name() === name);
		if (child === undefined) throw new Error(`clinkr: built command tree is missing group '${name}'`);
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

function buildLeafCommand<TContext>(options: BuildLeafCommandOptions<TContext>): Command {
	const { registered, context, io, state } = options;
	const command = createContainedCommand(registered.name, io);
	if (registered.description !== undefined) command.description(registered.description);
	if (registered.summary !== undefined) command.summary(registered.summary);
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
	if (registered.execution.type === "rendered") {
		command.addOption(
			new Option("--format <format>", "Output format.")
				.choices(["human", "json", "markdown", "md"])
				.default("human"),
		);
		command.addOption(
			new Option(
				"--shell-exit-code",
				"Use shell-visible Clinkr semantic exit codes; negative exits 1 instead of 0.",
			),
		);
	}
	command.addOption(
		new Option("--json-schema", "Print the JSON Schema for this command's input/output and exit."),
	);
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
			// Usage-error channel: raw message to stderr, exit 2, never enveloped
			// (even under --format json) — Python clinkr parity.
			io.stderr(formatUsageError(parsed.error, registered.plan));
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
						{ type: "failure", errorType: error.errorType, message: error.message },
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
					exit = { type: "failure", errorType: error.errorType, message: error.message };
				}
				state.exitCode = emitExit(exit, {
					format,
					io,
					renderHuman: registered.execution.renderHuman,
					renderMarkdown: registered.execution.renderMarkdown,
					legacyMachine: registered.execution.legacyMachine,
					shellExitCode: opts["shellExitCode"] === true,
				});
				return;
			}
			default:
				assertNever(registered.execution);
		}
	});
	return command;
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
	// TS clinkr is stricter than click: decimal digits only, no leading +, no
	// whitespace, no underscores. Click accepts "+5", " 5 ", and "1_000"; TS
	// intentionally rejects them. Parity arbitration belongs to pr-address-typescript-port.
	if (!/^-?\d+$/.test(value)) return null;
	return Number(value);
}

function accumulateValue(value: string, previous: string[] | undefined): string[] {
	return [...(previous ?? []), value];
}

function formatUsageError(error: z.ZodError, plan: SurfacePlan): string {
	const lines = error.issues.map((issue) => {
		const surface = surfaceNameForIssue(plan, issue);
		return surface === undefined ? `error: ${issue.message}` : `error: ${surface}: ${issue.message}`;
	});
	return `${lines.join("\n")}\n`;
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
