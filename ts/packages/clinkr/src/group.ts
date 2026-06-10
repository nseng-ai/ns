import { Argument, Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { z } from "zod";

import { emitExit, type ClinkrFormat, type LegacyMachineOutput } from "./emit.ts";
import type { ClinkrExit } from "./exit.ts";
import { ClinkrFailure } from "./failure.ts";
import { createProcessIo, type ClinkrIo } from "./io.ts";
import { buildJsonSchemaDocument } from "./json-schema.ts";
import {
	buildSurfacePlan,
	type OptionPlan,
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
	schema: S;
	handler: ClinkrHandler<TContext, S, T>;
	/** Source of `output_json_schema` for `--json-schema`; `{}` when absent. */
	resultSchema?: z.ZodType<T>;
	/** Human rendering for the ok variant; default is indented JSON of the data. */
	renderHuman?: (data: T) => string;
	/**
	 * Deprecated-from-birth escape hatch: routes the whole exit union through a
	 * legacy machine shape under `--format json` so migrated commands keep their
	 * pre-clinkr output contract. Kill tracked in the umbrella migration-debt
	 * ledger.
	 */
	legacyMachine?: (exit: ClinkrExit<T>) => LegacyMachineOutput;
	positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
}

export interface ClinkrGroupOptions {
	name: string;
	description?: string;
	/** Suppresses this group from its parent's help; it stays invocable. */
	isHidden?: boolean;
}

export interface ClinkrRunOptions<TContext> {
	context: TContext;
	io?: ClinkrIo;
}

interface RegisteredCommand<TContext> {
	name: string;
	description: string | undefined;
	schema: z.ZodObject;
	resultSchema: z.ZodType | undefined;
	handler: (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>;
	renderHuman: ((data: unknown) => string) | undefined;
	legacyMachine: ((exit: ClinkrExit<unknown>) => LegacyMachineOutput) | undefined;
	plan: SurfacePlan;
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

export class ClinkrGroup<TContext> {
	readonly name: string;
	readonly description: string | undefined;
	readonly isHidden: boolean;
	private registeredCommands: RegisteredCommand<TContext>[];
	private subgroups: ClinkrGroup<TContext>[];

	constructor(options: ClinkrGroupOptions) {
		this.name = options.name;
		this.description = options.description;
		this.isHidden = options.isHidden ?? false;
		this.registeredCommands = [];
		this.subgroups = [];
	}

	command<S extends z.ZodObject, T>(spec: ClinkrCommandSpec<TContext, S, T>): this {
		const plan = buildSurfacePlan(spec.name, spec.schema, spec.positionals ?? {});
		this.registeredCommands.push({
			name: spec.name,
			description: spec.description,
			schema: spec.schema,
			resultSchema: spec.resultSchema,
			// Erase the command generics once; zod re-establishes the request shape
			// at parse time, so the cast is backed by a runtime guarantee.
			handler: spec.handler as (ctx: TContext, request: unknown) => Promise<ClinkrExit<unknown>>,
			renderHuman: spec.renderHuman as ((data: unknown) => string) | undefined,
			legacyMachine: spec.legacyMachine as
				| ((exit: ClinkrExit<unknown>) => LegacyMachineOutput)
				| undefined,
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
		const program = this.buildCommand(options.context, io, state);
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

	private buildCommand(context: TContext, io: ClinkrIo, state: RunState): Command {
		const command = createContainedCommand(this.name, io);
		if (this.description !== undefined) command.description(this.description);
		// Python clinkr (click) parity: a group invoked bare prints help to
		// stdout and exits 0, where commander would error on stderr.
		command.action(() => {
			io.stdout(command.helpInformation());
			state.exitCode = 0;
		});
		for (const registered of this.registeredCommands) {
			command.addCommand(buildLeafCommand({ registered, context, io, state }));
		}
		for (const child of this.subgroups) {
			command.addCommand(child.buildCommand(context, io, state), { hidden: child.isHidden });
		}
		return command;
	}
}

function createContainedCommand(name: string, io: ClinkrIo): Command {
	const command = new Command(name);
	command.exitOverride();
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
	for (const positional of registered.plan.positionals) {
		command.addArgument(buildCommanderArgument(positional));
	}
	if (registered.plan.positionals.length > 0) {
		const parts = registered.plan.positionals.map((positional) =>
			positional.isRequired ? `<${positional.name}>` : `[${positional.name}]`,
		);
		command.usage(`[options] ${parts.join(" ")}`);
	}
	for (const optionPlan of registered.plan.options) {
		command.addOption(buildCommanderOption(optionPlan));
	}
	command.addOption(
		new Option("--format <format>", "Output format.").choices(["human", "json"]).default("human"),
	);
	command.addOption(
		new Option("--json-schema", "Print the JSON Schema for this command's input/output and exit."),
	);
	command.action(async (...actionArgs: unknown[]) => {
		const opts = command.opts<Record<string, unknown>>();
		// Eager like --help: schema printing happens before required-argument
		// validation, which lives entirely in zod below.
		if (opts["jsonSchema"] === true) {
			const document = buildJsonSchemaDocument(registered.schema, registered.resultSchema);
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
		let exit: ClinkrExit<unknown>;
		try {
			exit = await registered.handler(context, parsed.data);
		} catch (error) {
			if (!(error instanceof ClinkrFailure)) throw error;
			exit = { type: "failure", errorType: error.errorType, message: error.message };
		}
		const format: ClinkrFormat = opts["format"] === "json" ? "json" : "human";
		state.exitCode = emitExit(exit, {
			format,
			io,
			renderHuman: registered.renderHuman,
			legacyMachine: registered.legacyMachine,
		});
	});
	return command;
}

function buildCommanderArgument(plan: PositionalPlan): Argument {
	// Declared bracket-optional so commander never enforces requiredness: zod
	// owns it, keeping the usage-error channel uniform and --json-schema eager.
	const argument = new Argument(`[${plan.name}]`, plan.description);
	if (plan.kind.type === "number") argument.argParser(parseNumberValue);
	if (plan.kind.type === "enum") argument.choices([...plan.kind.values]);
	return argument;
}

function buildCommanderOption(plan: OptionPlan): Option {
	const option = new Option(plan.flag, plan.description === "" ? undefined : plan.description);
	switch (plan.kind.type) {
		case "number":
			option.argParser(parseNumberValue);
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
