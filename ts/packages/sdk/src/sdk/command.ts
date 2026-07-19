import {
	ClinkrGroup,
	envelopeJsonText,
	isJsonSchemaFlag,
	type ClinkrCompletionCandidate,
	type ClinkrCompletionResult,
	type ClinkrDynamicCompletionRequest,
	type ClinkrIo,
	type OptionSpec,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { PositionalSpec } from "@nseng-ai/clinkr/raw";
import { optionalEntry, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { ExtensionDescriptor } from "./descriptor.ts";
import type { NsExtensionApi } from "./execution.ts";
import { failure, ok, usageError, type CommandExit } from "./result.ts";

export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrFormat,
	OptionSpec,
	PositionalSpec,
	RenderCapabilities,
} from "@nseng-ai/clinkr";

export type NsCommandSchema = z.ZodObject;
export type NsCommandRequest<S extends NsCommandSchema> = z.output<S>;

export interface RawArgvCommandInvocation {
	/** Raw argv tail after ns has routed through the command path. */
	readonly argv: readonly string[];
	/** Display path segments after `ns`, used by adapters for help text only. */
	readonly commandPath?: readonly string[];
}

export type NsCommandCompletionRequest = ClinkrDynamicCompletionRequest;
export type NsCommandCompletionCandidate = ClinkrCompletionCandidate;
export type NsCommandCompletionResult = ClinkrCompletionResult;

export type NsCommandCompletionProvider = (
	ctx: NsExtensionApi,
	request: NsCommandCompletionRequest,
) =>
	| Promise<NsCommandCompletionResult | readonly NsCommandCompletionCandidate[]>
	| NsCommandCompletionResult
	| readonly NsCommandCompletionCandidate[];

type ParsedSdkCommandSpec<
	S extends NsCommandSchema = NsCommandSchema,
	T = unknown,
> = ParsedSdkCommandDefinition<S, T>;

interface ParsedSdkCommandDefinition<S extends NsCommandSchema, T> {
	readonly schema: S;
	readonly resultSchema?: z.ZodType<T>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	readonly completionProvider?: NsCommandCompletionProvider;
	run(ctx: NsExtensionApi, request: z.output<S>): Promise<CommandExit<T>> | CommandExit<T>;
}

interface NamedParsedSdkCommandDefinition<
	S extends NsCommandSchema,
	T,
> extends ParsedSdkCommandDefinition<S, T> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
}

const parsedSdkCommandSpec = Symbol("ns.parsed-sdk-command-spec");

export interface RawArgvCommand<T = unknown> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	run(
		ctx: NsExtensionApi,
		invocation: RawArgvCommandInvocation,
	): Promise<CommandExit<T>> | CommandExit<T>;
	complete?: ExplicitUndefined<"public-api-compatibility", NsCommandCompletionProvider>;
	readonly nsParsedCommandSpec?: unknown;
	readonly [parsedSdkCommandSpec]?: unknown;
}

export interface DefineCommandSpec<S extends NsCommandSchema, T> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly schema: S;
	readonly handler: (
		ctx: NsExtensionApi,
		request: z.output<S>,
	) => Promise<CommandExit<T>> | CommandExit<T>;
	readonly resultSchema: z.ZodType<T>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	readonly completionProvider?: NsCommandCompletionProvider;
}

export type RawArgvCommandSpec<T = unknown> = RawArgvCommand<T>;

export function defineRawCommand<T>(command: RawArgvCommandSpec<T>): RawArgvCommand<T> {
	return command;
}

export function defineCommand<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): RawArgvCommand<T> {
	const parsedSpec = parsedSpecForDefinedCommand(spec);
	return {
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		nsParsedCommandSpec: parsedSpec,
		[parsedSdkCommandSpec]: parsedSpec,
		async run(ctx, invocation) {
			return await runParsedSdkCommand(ctx, invocation, commandDefinitionFromSpec(spec));
		},
		complete: async (ctx: NsExtensionApi, request: NsCommandCompletionRequest) =>
			await completeParsedSdkCommand(ctx, request, commandDefinitionFromSpec(spec)),
	};
}

export type NsCommand<_S extends NsCommandSchema = z.ZodObject, T = unknown> = RawArgvCommand<T>;

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor {
	return extension;
}

function commandDefinitionFromSpec<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): NamedParsedSdkCommandDefinition<S, T> {
	return {
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		schema: spec.schema,
		resultSchema: spec.resultSchema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
		...(spec.completionProvider === undefined
			? {}
			: { completionProvider: spec.completionProvider }),
		run: spec.handler,
	};
}

export function parsedSpecForCommand(
	command: Pick<RawArgvCommand, "name"> & { readonly [parsedSdkCommandSpec]?: unknown },
): ParsedSdkCommandSpec<NsCommandSchema, unknown> | undefined {
	const spec = command[parsedSdkCommandSpec];
	if (spec === undefined) return undefined;
	return spec as ParsedSdkCommandSpec<NsCommandSchema, unknown>;
}

export function defineInternalParsedCommand<S extends NsCommandSchema, T>(
	options: NamedParsedSdkCommandDefinition<S, T>,
): RawArgvCommand<T> {
	const completionProvider = options.completionProvider;
	const command: RawArgvCommand<T> = {
		name: options.name,
		summary: options.summary,
		description: options.description,
		[parsedSdkCommandSpec]: {
			schema: options.schema,
			...(options.resultSchema === undefined ? {} : { resultSchema: options.resultSchema }),
			...(options.positionals === undefined ? {} : { positionals: options.positionals }),
			...(options.options === undefined ? {} : { options: options.options }),
			...(options.renderHuman === undefined ? {} : { renderHuman: options.renderHuman }),
			...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
			...(options.completionProvider === undefined
				? {}
				: { completionProvider: options.completionProvider }),
			run: options.run,
		},
		async run(ctx, invocation) {
			return await runParsedSdkCommand(ctx, invocation, options);
		},
		...(completionProvider === undefined
			? {}
			: {
					complete: async (ctx: NsExtensionApi, request: NsCommandCompletionRequest) =>
						await completeParsedSdkCommand(ctx, request, options),
				}),
	};
	return command;
}

function parsedSpecForDefinedCommand<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): ParsedSdkCommandSpec<NsCommandSchema, T> {
	return commandDefinitionFromSpec(spec);
}

async function runParsedSdkCommand<S extends NsCommandSchema, T>(
	ctx: NsExtensionApi,
	invocation: RawArgvCommandInvocation,
	options: NamedParsedSdkCommandDefinition<S, T>,
): Promise<CommandExit<T>> {
	let capturedExit: CommandExit<T> | undefined;
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cli = buildParsedSdkCommandCli(invocation, options, (exit) => {
		capturedExit = withRenderOverrides(exit, options, ctx.renderCapabilities);
		return capturedExit;
	});
	const exitCode = await cli.run([options.name, ...invocation.argv], {
		context: ctx,
		io: captureIo(ctx, stdout, stderr),
	});
	if (capturedExit !== undefined) return capturedExit;
	const stdoutText = stdout.join("").trimEnd();
	const stderrText = stderr.join("").trimEnd();
	if (exitCode === 0) {
		if (isJsonSchemaInvocation(invocation.argv)) return jsonSchemaExit<T>(stdoutText);
		return ok(stdoutText, { human: stdoutText, markdown: stdoutText }) as CommandExit<T>;
	}
	return usageError(
		stderrText === "" ? `Invalid invocation for command ${options.name}.` : stderrText,
		{ command: options.name },
	);
}

async function completeParsedSdkCommand<S extends NsCommandSchema, T>(
	ctx: NsExtensionApi,
	request: NsCommandCompletionRequest,
	options: NamedParsedSdkCommandDefinition<S, T>,
): Promise<ClinkrCompletionResult> {
	const cli = buildParsedSdkCommandCli(
		{ argv: [], commandPath: [options.name] },
		options,
		(exit) => exit,
	);
	return await cli.completeAsync(
		{ words: [options.name, ...request.args, request.current] },
		{
			context: ctx,
			onDynamicCompletionError: () => {},
		},
	);
}

function buildParsedSdkCommandCli<S extends NsCommandSchema, T>(
	invocation: RawArgvCommandInvocation,
	options: NamedParsedSdkCommandDefinition<S, T>,
	onExit: (exit: CommandExit<T>) => CommandExit<T>,
): ClinkrGroup<NsExtensionApi> {
	const commandPath = invocation.commandPath ?? [options.name];
	const parentPath = commandPath.slice(0, -1);
	const leafName = commandPath.at(-1) ?? options.name;
	const cli = new ClinkrGroup<NsExtensionApi>({ name: ["ns", ...parentPath].join(" ") });
	cli.command({
		name: leafName,
		description: options.description,
		summary: options.summary,
		schema: options.schema,
		...(options.resultSchema === undefined ? {} : { resultSchema: options.resultSchema }),
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		...(options.options === undefined ? {} : { options: options.options }),
		...(options.renderHuman === undefined ? {} : { renderHuman: options.renderHuman }),
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		...(options.completionProvider === undefined
			? {}
			: { completionProvider: options.completionProvider }),
		handler: async (ctx, request) => onExit(await options.run(ctx, request)),
	});
	return cli;
}

function withRenderOverrides<T>(
	exit: CommandExit<T>,
	spec: {
		readonly resultSchema?: z.ZodType<T>;
		readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
		readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	},
	caps: RenderCapabilities,
): CommandExit<T> {
	if (exit.type !== "ok") return exit;
	const data = spec.resultSchema === undefined ? exit.data : spec.resultSchema.parse(exit.data);
	return {
		type: "ok",
		data,
		...(exit.human !== undefined
			? { human: exit.human }
			: spec.renderHuman === undefined
				? {}
				: { human: spec.renderHuman(data, caps) }),
		...(exit.markdown !== undefined
			? { markdown: exit.markdown }
			: spec.renderMarkdown === undefined
				? {}
				: { markdown: spec.renderMarkdown(data, caps) }),
	};
}

function captureIo(ctx: NsExtensionApi, stdout: string[], stderr: string[]): ClinkrIo {
	return {
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		canEmitAnsi: ctx.renderCapabilities.canEmitAnsi,
		...optionalEntry("caps", ctx.renderCapabilities.caps),
	};
}

function isJsonSchemaInvocation(argv: readonly string[]): boolean {
	return argv.some(isJsonSchemaFlag);
}

function jsonSchemaExit<T>(text: string): CommandExit<T> {
	try {
		const parsed: unknown = JSON.parse(text);
		return ok(parsed, {
			human: envelopeJsonText(parsed),
			markdown: envelopeJsonText(parsed),
		}) as CommandExit<T>;
	} catch (error) {
		return failure(
			"extension-json-schema-invalid",
			`Command produced invalid JSON Schema output.\n${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
