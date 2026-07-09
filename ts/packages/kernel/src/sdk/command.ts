import type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	OptionSpec,
	RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { PositionalSpec } from "@nseng-ai/clinkr/raw";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import type { z } from "zod";

import type { ExtensionDescriptor } from "./descriptor.ts";
import type { NsExtensionApi } from "./execution.ts";
import type { CommandExit } from "./result.ts";

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

const RAW_COMMAND_KIND = "raw";

export interface KernelCommandInvocation {
	/** Raw argv tail after ns has routed through the command path. */
	readonly argv: readonly string[];
}

export interface KernelCommand<T = unknown> {
	readonly kind: typeof RAW_COMMAND_KIND;
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	run(
		ctx: NsExtensionApi,
		invocation: KernelCommandInvocation,
	): Promise<CommandExit<T>> | CommandExit<T>;
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

export type KernelCommandSpec<T = unknown> = Omit<KernelCommand<T>, "kind"> & {
	readonly kind?: typeof RAW_COMMAND_KIND;
};

export function defineRawCommand<T>(command: KernelCommandSpec<T>): KernelCommand<T> {
	return { ...command, kind: RAW_COMMAND_KIND };
}

export function isDefinedRawCommand(command: KernelCommand | NsCommand): command is KernelCommand {
	return "kind" in command && command.kind === RAW_COMMAND_KIND;
}

export function defineCommand<S extends NsCommandSchema, T>(
	spec: DefineCommandSpec<S, T>,
): NsCommand<S, T> {
	return {
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		schema: spec.schema,
		resultSchema: spec.resultSchema,
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(spec.renderHuman === undefined
			? {}
			: {
					renderHuman: (data: unknown, caps: RenderCapabilities) =>
						spec.renderHuman?.(spec.resultSchema.parse(data), caps) ?? "",
				}),
		...(spec.renderMarkdown === undefined
			? {}
			: {
					renderMarkdown: (data: unknown, caps: RenderCapabilities) =>
						spec.renderMarkdown?.(spec.resultSchema.parse(data), caps) ?? "",
				}),
		...(spec.completionProvider === undefined
			? {}
			: { completionProvider: spec.completionProvider }),
		run: spec.handler,
	};
}

export type NsCommandCompletionProvider = (
	ctx: NsExtensionApi,
	request: ClinkrDynamicCompletionRequest,
) =>
	| Promise<ClinkrCompletionResult | readonly ClinkrCompletionCandidate[]>
	| ClinkrCompletionResult
	| readonly ClinkrCompletionCandidate[];

export interface NsCommand<S extends NsCommandSchema = z.ZodObject, T = unknown> {
	name: string;
	summary: string;
	description: string;
	schema?: ExplicitUndefined<"public-api-compatibility", S>;
	positionals?: ExplicitUndefined<
		"public-api-compatibility",
		Partial<Record<keyof z.infer<S> & string, PositionalSpec>>
	>;
	options?: ExplicitUndefined<
		"public-api-compatibility",
		Partial<Record<keyof z.infer<S> & string, OptionSpec>>
	>;
	resultSchema?: ExplicitUndefined<"public-api-compatibility", z.ZodType<T>>;
	renderHuman?: ExplicitUndefined<
		"public-api-compatibility",
		(data: unknown, caps: RenderCapabilities) => string
	>;
	renderMarkdown?: ExplicitUndefined<
		"public-api-compatibility",
		(data: unknown, caps: RenderCapabilities) => string
	>;
	completionProvider?: ExplicitUndefined<"public-api-compatibility", NsCommandCompletionProvider>;
	run(ctx: NsExtensionApi, request: z.output<S>): Promise<CommandExit<T>> | CommandExit<T>;
}

export interface NsExtension<
	TCommands extends readonly (NsCommand | KernelCommand)[] = readonly NsCommand[],
> {
	commands?: ExplicitUndefined<"overload-selector", TCommands>;
}

type NsCommandTuple<TSchemas extends readonly NsCommandSchema[]> = {
	readonly [Index in keyof TSchemas]: NsCommand<TSchemas[Index]>;
};

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor;
export function defineExtension(extension: {
	commands?: ExplicitUndefined<"overload-selector", never>;
}): NsExtension<readonly []>;
export function defineExtension(extension: NsExtension<readonly []>): NsExtension<readonly []>;
export function defineExtension<S1 extends NsCommandSchema = z.ZodObject>(
	extension: NsExtension<readonly [NsCommand<S1>]>,
): NsExtension<readonly [NsCommand<S1>]>;
export function defineExtension<
	S1 extends NsCommandSchema = z.ZodObject,
	S2 extends NsCommandSchema = z.ZodObject,
>(
	extension: NsExtension<readonly [NsCommand<S1>, NsCommand<S2>]>,
): NsExtension<readonly [NsCommand<S1>, NsCommand<S2>]>;
export function defineExtension<
	S1 extends NsCommandSchema = z.ZodObject,
	S2 extends NsCommandSchema = z.ZodObject,
	S3 extends NsCommandSchema = z.ZodObject,
>(
	extension: NsExtension<readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>]>,
): NsExtension<readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>]>;
export function defineExtension<
	S1 extends NsCommandSchema = z.ZodObject,
	S2 extends NsCommandSchema = z.ZodObject,
	S3 extends NsCommandSchema = z.ZodObject,
	S4 extends NsCommandSchema = z.ZodObject,
	const SRest extends readonly NsCommandSchema[] = readonly [],
>(
	extension: NsExtension<
		readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>, NsCommand<S4>, ...NsCommandTuple<SRest>]
	>,
): NsExtension<
	readonly [NsCommand<S1>, NsCommand<S2>, NsCommand<S3>, NsCommand<S4>, ...NsCommandTuple<SRest>]
>;
export function defineExtension(extension: NsExtension): NsExtension {
	return extension;
}
