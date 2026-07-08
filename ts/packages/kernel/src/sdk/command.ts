import {
	ClinkrGroup,
	envelopeJsonText,
	type ClinkrCompletionCandidate,
	type ClinkrCompletionResult,
	type ClinkrDynamicCompletionRequest,
	type OptionSpec,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { ClinkrIo } from "@nseng-ai/clinkr";
import type { PositionalSpec } from "@nseng-ai/clinkr/raw";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
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

export type KernelCommandCompletionRequest = ClinkrDynamicCompletionRequest;
export type KernelCommandCompletionCandidate = ClinkrCompletionCandidate;
export type KernelCommandCompletionResult = ClinkrCompletionResult;

export type KernelCommandCompletionProvider = (
	ctx: NsExtensionApi,
	request: KernelCommandCompletionRequest,
) =>
	| Promise<KernelCommandCompletionResult | readonly KernelCommandCompletionCandidate[]>
	| KernelCommandCompletionResult
	| readonly KernelCommandCompletionCandidate[];

export interface ParsedKernelCommandSpec<S extends NsCommandSchema = NsCommandSchema, T = unknown> {
	readonly schema: S;
	readonly resultSchema?: z.ZodType<T>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	readonly completionProvider?: KernelCommandCompletionProvider;
	run(ctx: NsExtensionApi, request: z.output<S>): Promise<CommandExit<T>> | CommandExit<T>;
}

const parsedKernelCommandSpec = Symbol("ns.parsed-kernel-command-spec");

export interface RawArgvCommand<T = unknown> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	run(
		ctx: NsExtensionApi,
		invocation: RawArgvCommandInvocation,
	): Promise<CommandExit<T>> | CommandExit<T>;
	complete?: ExplicitUndefined<"public-api-compatibility", KernelCommandCompletionProvider>;
	readonly nsParsedCommandSpec?: unknown;
	readonly [parsedKernelCommandSpec]?: unknown;
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
	readonly completionProvider?: KernelCommandCompletionProvider;
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
		[parsedKernelCommandSpec]: parsedSpec,
		async run(ctx, invocation) {
			return await runDefinedCommand(ctx, invocation, spec);
		},
		complete: async (ctx: NsExtensionApi, request: KernelCommandCompletionRequest) =>
			await completeDefinedCommand(ctx, request, spec),
	};
}

export type NsCommandCompletionProvider = KernelCommandCompletionProvider;
export type NsCommand<_S extends NsCommandSchema = z.ZodObject, T = unknown> = RawArgvCommand<T>;

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor {
	return extension;
}

async function runDefinedCommand<S extends NsCommandSchema, T>(
	ctx: NsExtensionApi,
	invocation: RawArgvCommandInvocation,
	spec: DefineCommandSpec<S, T>,
): Promise<CommandExit<T>> {
	let capturedExit: CommandExit<T> | undefined;
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cli = buildDefinedCommandCli(invocation, spec, (exit) => {
		capturedExit = withRenderOverrides(exit, spec, ctx.renderCapabilities);
		return capturedExit;
	});
	const exitCode = await cli.run([spec.name, ...invocation.argv], {
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
		stderrText === "" ? `Invalid invocation for command ${spec.name}.` : stderrText,
		{
			command: spec.name,
		},
	);
}

async function completeDefinedCommand<S extends NsCommandSchema, T>(
	ctx: NsExtensionApi,
	request: KernelCommandCompletionRequest,
	spec: DefineCommandSpec<S, T>,
): Promise<ClinkrCompletionResult> {
	const cli = buildDefinedCommandCli({ argv: [], commandPath: [spec.name] }, spec, (exit) => exit);
	return await cli.completeAsync(
		{ words: [spec.name, ...request.args, request.current] },
		{
			context: ctx,
			onDynamicCompletionError: () => {},
		},
	);
}

function buildDefinedCommandCli<S extends NsCommandSchema, T>(
	invocation: RawArgvCommandInvocation,
	spec: DefineCommandSpec<S, T>,
	onExit: (exit: CommandExit<T>) => CommandExit<T>,
): ClinkrGroup<NsExtensionApi> {
	const commandPath = invocation.commandPath ?? [spec.name];
	const parentPath = commandPath.slice(0, -1);
	const leafName = commandPath.at(-1) ?? spec.name;
	const cli = new ClinkrGroup<NsExtensionApi>({ name: ["ns", ...parentPath].join(" ") });
	cli.command({
		name: leafName,
		description: spec.description,
		summary: spec.summary,
		schema: spec.schema,
		resultSchema: spec.resultSchema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
		...(spec.completionProvider === undefined
			? {}
			: { completionProvider: spec.completionProvider }),
		handler: async (ctx, request) => onExit(await spec.handler(ctx, request)),
	});
	return cli;
}

export function parsedSpecForCommand(
	command: RawArgvCommand,
): ParsedKernelCommandSpec<NsCommandSchema, unknown> | undefined {
	const spec = command[parsedKernelCommandSpec];
	if (spec === undefined) return undefined;
	return spec as ParsedKernelCommandSpec<NsCommandSchema, unknown>;
}

export function defineParsedCommand<S extends NsCommandSchema, T>(options: {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly schema: S;
	readonly resultSchema?: z.ZodType<T>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
	readonly completionProvider?: KernelCommandCompletionProvider;
	readonly run: (
		ctx: NsExtensionApi,
		request: z.output<S>,
	) => Promise<CommandExit<T>> | CommandExit<T>;
}): RawArgvCommand<T> {
	const completionProvider = options.completionProvider;
	const command: RawArgvCommand<T> = {
		name: options.name,
		summary: options.summary,
		description: options.description,
		[parsedKernelCommandSpec]: {
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
			return await runParsedCommand(ctx, invocation, options);
		},
		...(completionProvider === undefined
			? {}
			: {
					complete: async (ctx: NsExtensionApi, request: KernelCommandCompletionRequest) =>
						await completionProvider(ctx, request),
				}),
	};
	return command;
}

function parsedSpecForDefinedCommand<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): ParsedKernelCommandSpec<NsCommandSchema, T> {
	return {
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

async function runParsedCommand<S extends NsCommandSchema, T>(
	ctx: NsExtensionApi,
	invocation: RawArgvCommandInvocation,
	options: {
		readonly name: string;
		readonly summary: string;
		readonly description: string;
		readonly schema: S;
		readonly resultSchema?: z.ZodType<T>;
		readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
		readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
		readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
		readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
		readonly completionProvider?: KernelCommandCompletionProvider;
		readonly run: (
			ctx: NsExtensionApi,
			request: z.output<S>,
		) => Promise<CommandExit<T>> | CommandExit<T>;
	},
): Promise<CommandExit<T>> {
	let capturedExit: CommandExit<T> | undefined;
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cli = buildParsedCommandCli(invocation, options, (exit) => {
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

function buildParsedCommandCli<S extends NsCommandSchema, T>(
	invocation: RawArgvCommandInvocation,
	options: {
		readonly name: string;
		readonly summary: string;
		readonly description: string;
		readonly schema: S;
		readonly resultSchema?: z.ZodType<T>;
		readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
		readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
		readonly renderHuman?: (data: T, caps: RenderCapabilities) => string;
		readonly renderMarkdown?: (data: T, caps: RenderCapabilities) => string;
		readonly completionProvider?: KernelCommandCompletionProvider;
		readonly run: (
			ctx: NsExtensionApi,
			request: z.output<S>,
		) => Promise<CommandExit<T>> | CommandExit<T>;
	},
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
		...(ctx.renderCapabilities.caps === undefined ? {} : { caps: ctx.renderCapabilities.caps }),
	};
}

function isJsonSchemaInvocation(argv: readonly string[]): boolean {
	return argv.some((arg) => arg === "--json-schema" || arg.startsWith("--json-schema="));
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
