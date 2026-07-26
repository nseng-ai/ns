import { isAbsolute } from "node:path";

import {
	defineCommand,
	type ClinkrCommandDefinition,
	type ClinkrCommandMetadata,
	type ClinkrCompletionCandidate,
	type ClinkrCompletionResult,
	type ClinkrDynamicCompletionRequest,
	type OptionSpec,
	type PositionalSpec,
	type RenderCapabilities,
} from "@nseng-ai/clinkr";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

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

export interface RawArgvCommand<T = unknown> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	run(
		ctx: NsExtensionApi,
		invocation: RawArgvCommandInvocation,
	): Promise<CommandExit<T>> | CommandExit<T>;
	complete?: ExplicitUndefined<"public-api-compatibility", NsCommandCompletionProvider>;
}

export type RawArgvCommandSpec<T = unknown> = RawArgvCommand<T>;

export function defineRawCommand<T>(command: RawArgvCommandSpec<T>): RawArgvCommand<T> {
	return Object.freeze({ ...command });
}

export interface DefineCommandSpec<
	S extends NsCommandSchema,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> extends ClinkrCommandMetadata {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly schema: S;
	readonly handler: (
		ctx: NsExtensionApi,
		request: z.output<S>,
	) =>
		| Promise<CommandExit<TResult, TNegative, TFailure, TUsageError>>
		| CommandExit<TResult, TNegative, TFailure, TUsageError>;
	readonly resultSchema?: z.ZodType<TResult>;
	readonly negativeSchema?: z.ZodType<TNegative>;
	readonly failureSchema?: z.ZodType<TFailure>;
	readonly usageErrorSchema?: z.ZodType<TUsageError>;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, PositionalSpec>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, OptionSpec>>;
	readonly renderHuman?: (
		data: TResult | TNegative | TFailure | TUsageError,
		caps: RenderCapabilities,
	) => string;
	readonly renderMarkdown?: (
		data: TResult | TNegative | TFailure | TUsageError,
		caps: RenderCapabilities,
	) => string;
	readonly completionProvider?: NsCommandCompletionProvider;
}

interface NsCommandIdentity {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
}

export type NsCommand<
	S extends NsCommandSchema = z.ZodObject,
	TResult = never,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
> = [TResult] extends [never]
	? NsCommandIdentity
	: Readonly<
			NsCommandIdentity &
				ClinkrCommandDefinition<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError>
		>;

/** Define one native Clinkr command contribution for the ns extension catalog. */
export function defineNsCommand<
	S extends NsCommandSchema,
	TResult,
	TNegative = TResult,
	TFailure = TResult,
	TUsageError = TResult,
>(
	spec: DefineCommandSpec<S, TResult, TNegative, TFailure, TUsageError>,
): NsCommand<S, TResult, TNegative, TFailure, TUsageError> {
	const definition = defineCommand<NsExtensionApi, S, TResult, TNegative, TFailure, TUsageError>({
		schema: spec.schema,
		...(spec.resultSchema === undefined ? {} : { resultSchema: spec.resultSchema }),
		...(spec.negativeSchema === undefined ? {} : { negativeSchema: spec.negativeSchema }),
		...(spec.failureSchema === undefined ? {} : { failureSchema: spec.failureSchema }),
		...(spec.usageErrorSchema === undefined ? {} : { usageErrorSchema: spec.usageErrorSchema }),
		...(spec.positionals === undefined ? {} : { positionals: spec.positionals }),
		...(spec.options === undefined ? {} : { options: spec.options }),
		...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
		...(spec.completionProvider === undefined
			? {}
			: { completionProvider: spec.completionProvider }),
		handler: async (ctx, request) => await spec.handler(ctx, request),
	});
	return Object.freeze({
		name: spec.name,
		summary: spec.summary,
		description: spec.description,
		...definition,
	});
}

export { defineNsCommand as defineCommand };

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor {
	if ("commandDirectory" in extension && !isAbsolute(extension.commandDirectory)) {
		throw new Error(
			`ns extension: commandDirectory must be absolute, received '${extension.commandDirectory}'`,
		);
	}
	return extension;
}
