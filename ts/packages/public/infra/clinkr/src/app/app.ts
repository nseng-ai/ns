import path from "node:path";
import { pathToFileURL } from "node:url";

import { Command, CommanderError, Option } from "commander";
import { z } from "zod";

import type { ClinkrIo } from "../io.ts";
import { createProcessIo } from "../io.ts";
import { buildSurfacePlan, type SurfacePlan } from "../surface.ts";
import {
	buildCommandJsonSchemaDocument,
	cliAnnotationFor,
	type ClinkrCommandDefinition,
	type ContextFreeCommandDefinition,
	type ContextfulCommandDefinition,
} from "./command-definition.ts";
import {
	envelopeJsonText,
	exitCodeFor,
	toEnvelope,
	type CommandOutcome,
	type SuccessOutcome,
	type UsageErrorOutcome,
} from "./outcome.ts";

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

interface LoadedCommandModule {
	command: () => Promise<unknown>;
}

interface LoadedMetadataModule {
	metadata: () => unknown;
}

function isExactCommandModule(value: unknown): value is LoadedCommandModule {
	return isExactFunctionModule(value, "command");
}

function isExactMetadataModule(value: unknown): value is LoadedMetadataModule {
	return isExactFunctionModule(value, "metadata");
}

function isExactFunctionModule(value: unknown, exportName: "command" | "metadata"): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return Object.keys(record).length === 1 && typeof record[exportName] === "function";
}

function isCommandMetadata(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	const allowed = new Set(["description", "summary", "aliases", "hidden", "helpGroup"]);
	if (Object.keys(record).some((key) => !allowed.has(key))) return false;
	if (typeof record.description !== "string") return false;
	if (record.summary !== undefined && typeof record.summary !== "string") return false;
	if (record.hidden !== undefined && typeof record.hidden !== "boolean") return false;
	if (record.helpGroup !== undefined && typeof record.helpGroup !== "string") return false;
	return (
		record.aliases === undefined ||
		(Array.isArray(record.aliases) && record.aliases.every((alias) => typeof alias === "string"))
	);
}

const DEFINITION_KEYS = new Set([
	"schema",
	"resultSchema",
	"renderHuman",
	"renderMarkdown",
	"handler",
	"completionProvider",
	"requiresContext",
]);

function isCommandDefinition(value: unknown): value is ClinkrCommandDefinition<unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if (Object.keys(record).some((key) => !DEFINITION_KEYS.has(key))) return false;
	if (!(record.schema instanceof z.ZodObject) || typeof record.handler !== "function") return false;
	if (record.requiresContext !== undefined && record.requiresContext !== true) return false;
	if (record.resultSchema !== undefined && !(record.resultSchema instanceof z.ZodType)) {
		return false;
	}
	for (const key of ["renderHuman", "renderMarkdown", "completionProvider"] as const) {
		if (record[key] !== undefined && typeof record[key] !== "function") return false;
	}
	return true;
}

class FilesystemClinkrApp<TContext> {
	private readonly name: string;
	private readonly commandDirectory: string;
	readonly requiresContext: boolean;
	private loaded: Promise<ClinkrCommandDefinition<TContext>> | undefined;

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
		const definition = await this.loadDefinition();
		if ((definition.requiresContext === true) !== this.requiresContext) {
			throw new Error("clinkr: selected command context mode does not match the app");
		}
		const parsed = parseGlobalFlags(argv);
		if (parsed.ok ? parsed.flags.help : parsed.help) {
			io.stdout(buildCommandSurface(this.name, definition).command.helpInformation());
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
			io.stdout(`${envelopeJsonText(buildCommandJsonSchemaDocument(definition))}\n`);
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
			const parsedArgv = parseArgv(this.name, rest, definition);
			if (!parsedArgv.success)
				return emitUsageError(io, format, parsedArgv.message, "invalid-request");
			request = parsedArgv.data as Record<string, unknown>;
		}
		const outcome = this.requiresContext
			? await (definition as ContextfulCommandDefinition<TContext>).handler(
					(options as ClinkrRunOptions<TContext>).context,
					request,
				)
			: await (definition as ContextFreeCommandDefinition).handler(request);
		validateOutcome(outcome, definition);
		emitOutcome(io, outcome, definition, format);
		return exitCodeFor(outcome.status);
	}

	private async loadDefinition(): Promise<ClinkrCommandDefinition<TContext>> {
		if (this.loaded !== undefined) return this.loaded;
		this.loaded = this.importDefinition();
		try {
			return await this.loaded;
		} catch (error) {
			this.loaded = undefined;
			throw error;
		}
	}

	private async importDefinition(): Promise<ClinkrCommandDefinition<TContext>> {
		const commandPath = path.join(this.commandDirectory, "command.ts");
		const metadataPath = path.join(this.commandDirectory, "metadata.ts");
		const metadataModule: unknown = await import(pathToFileURL(metadataPath).href);
		if (!isExactMetadataModule(metadataModule))
			throw new Error(`clinkr: malformed metadata module ${metadataPath}`);
		const metadata = metadataModule.metadata();
		if (!isCommandMetadata(metadata))
			throw new Error(`clinkr: malformed command metadata ${metadataPath}`);
		const module: unknown = await import(pathToFileURL(commandPath).href);
		if (!isExactCommandModule(module))
			throw new Error(`clinkr: malformed command module ${commandPath}`);
		const definition = await module.command();
		if (!isCommandDefinition(definition))
			throw new Error(`clinkr: malformed command definition ${commandPath}`);
		return definition as ClinkrCommandDefinition<TContext>;
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
function buildCommandSurface(name: string, definition: ClinkrCommandDefinition): CommandSurface {
	const positionals: Record<string, { position: number }> = {};
	const optionSpecs: Record<string, { short?: string }> = {};
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
		.exitOverride()
		.configureOutput({ writeOut: () => {}, writeErr: () => {} });
	for (const positional of surface.positionals) {
		command.argument(
			`${positional.isRequired ? "<" : "["}${positional.name}${positional.isRequired ? ">" : "]"}`,
			positional.description,
		);
	}
	for (const option of surface.options) {
		const commanderOption = new Option(option.flag, option.description);
		if (option.hasDefault) commanderOption.default(option.defaultValue);
		command.addOption(commanderOption);
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
): { success: true; data: unknown } | { success: false; message: string } {
	const { command, surface } = buildCommandSurface(name, definition);
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

function parseJsonInput(
	text: string,
	schema: z.ZodObject,
):
	| { success: true; data: unknown }
	| { success: false; message: string; errorType: string; data?: unknown } {
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
	/** argv with every global flag (and `--format` value) removed. */
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
 * Success data is the only validated payload: it must match `resultSchema`
 * when declared and must be absent otherwise. Error-outcome `data` passes
 * through unvalidated; it must be JSON-serializable.
 */
function validateOutcome(
	outcome: CommandOutcome<unknown>,
	definition: ClinkrCommandDefinition,
): void {
	if (outcome.status !== "success") return;
	if (definition.resultSchema === undefined) {
		if (outcome.data !== undefined)
			throw new Error("clinkr: success outcome data requires a resultSchema");
		return;
	}
	definition.resultSchema.parse(outcome.data);
}

function emitOutcome(
	io: ClinkrIo,
	outcome: CommandOutcome<unknown>,
	definition: ClinkrCommandDefinition,
	format: "human" | "json" | "md",
): void {
	if (format === "json") {
		io.stdout(`${envelopeJsonText(toEnvelope(outcome))}\n`);
		return;
	}
	if (outcome.status === "success") {
		emitSuccess(io, outcome, definition, format);
		return;
	}
	if (outcome.status === "negative") {
		io.stdout(`${outcome.human ?? outcome.message}\n`);
		return;
	}
	io.stderr(`${outcome.message}\n`);
}

function emitSuccess(
	io: ClinkrIo,
	outcome: SuccessOutcome<unknown>,
	definition: ClinkrCommandDefinition,
	format: "human" | "json" | "md",
): void {
	const override = format === "md" ? (outcome.markdown ?? outcome.human) : outcome.human;
	if (override !== undefined) {
		io.stdout(`${override}\n`);
		return;
	}
	const renderer =
		format === "md"
			? (definition.renderMarkdown ?? definition.renderHuman)
			: definition.renderHuman;
	if (renderer === undefined || outcome.data === undefined) return;
	const text = renderer(outcome.data, { canEmitAnsi: io.canEmitAnsi === true });
	io.stdout(`${text}\n`);
}

function emitUsageError(
	io: ClinkrIo,
	format: OutputFormat,
	message: string,
	errorType: string,
	data?: unknown,
): number {
	const outcome: UsageErrorOutcome = {
		status: "usage-error",
		errorType,
		message,
		...(data === undefined ? {} : { data }),
	};
	if (format === "json") io.stdout(`${envelopeJsonText(toEnvelope(outcome))}\n`);
	else io.stderr(`${message}\n`);
	return exitCodeFor(outcome.status);
}
