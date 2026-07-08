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

export interface KernelCommandInvocation {
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

export interface KernelCommand<T = unknown> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	run(
		ctx: NsExtensionApi,
		invocation: KernelCommandInvocation,
	): Promise<CommandExit<T>> | CommandExit<T>;
	complete?: ExplicitUndefined<"public-api-compatibility", KernelCommandCompletionProvider>;
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

export type KernelCommandSpec<T = unknown> = KernelCommand<T>;

export function defineRawCommand<T>(command: KernelCommandSpec<T>): KernelCommand<T> {
	return command;
}

export function defineCommand<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): KernelCommand<T> {
	return {
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		async run(ctx, invocation) {
			return await runDefinedCommand(ctx, invocation, spec);
		},
		complete: async (ctx: NsExtensionApi, request: KernelCommandCompletionRequest) =>
			await completeDefinedCommand(ctx, request, spec),
	};
}

export type NsCommandCompletionProvider = KernelCommandCompletionProvider;
export type NsCommand<_S extends NsCommandSchema = z.ZodObject, T = unknown> = KernelCommand<T>;

export interface NsExtension<
	TCommands extends readonly KernelCommand[] = readonly KernelCommand[],
> {
	commands?: ExplicitUndefined<"overload-selector", TCommands>;
}

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor;
export function defineExtension<const TCommands extends readonly KernelCommand[]>(
	extension: NsExtension<TCommands>,
): NsExtension<TCommands>;
export function defineExtension(extension: NsExtension): NsExtension {
	return extension;
}

async function runDefinedCommand<S extends NsCommandSchema, T>(
	ctx: NsExtensionApi,
	invocation: KernelCommandInvocation,
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
	invocation: KernelCommandInvocation,
	spec: DefineCommandSpec<S, T>,
	onExit: (exit: CommandExit<T>) => CommandExit<T>,
): ClinkrGroup<NsExtensionApi> {
	const commandPath = invocation.commandPath ?? [spec.name];
	const parentPath = commandPath.slice(0, -1);
	const cli = new ClinkrGroup<NsExtensionApi>({ name: ["ns", ...parentPath].join(" ") });
	cli.command({
		name: spec.name,
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

function withRenderOverrides<T>(
	exit: CommandExit<T>,
	spec: Pick<
		DefineCommandSpec<NsCommandSchema, T>,
		"resultSchema" | "renderHuman" | "renderMarkdown"
	>,
	caps: RenderCapabilities,
): CommandExit<T> {
	if (exit.type !== "ok") return exit;
	const data = spec.resultSchema.parse(exit.data);
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
