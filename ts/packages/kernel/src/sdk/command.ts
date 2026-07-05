import type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	OptionSpec,
	RenderCapabilities,
} from "@ns/clinkr";
import type { PositionalSpec } from "@ns/clinkr/raw";
import type { ExplicitUndefined } from "@ns/core/primitives";
import type { z } from "zod";

import type { NsExtensionApi } from "./execution.ts";
import type { NsResult } from "./result.ts";

export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionResult,
	ClinkrDynamicCompletionRequest,
	ClinkrExit,
	ClinkrFormat,
	OptionSpec,
	PositionalSpec,
	RenderCapabilities,
} from "@ns/clinkr";

export type NsCommandSchema = z.ZodObject;
export type NsCommandRequest<S extends NsCommandSchema> = z.output<S>;
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
	run(
		ctx: NsExtensionApi,
		request: z.output<S>,
	): Promise<NsResult | ClinkrExit<T>> | NsResult | ClinkrExit<T>;
}

export interface NsExtension<TCommands extends readonly NsCommand[] = readonly NsCommand[]> {
	commands?: ExplicitUndefined<"overload-selector", TCommands>;
}

type NsCommandTuple<TSchemas extends readonly NsCommandSchema[]> = {
	readonly [Index in keyof TSchemas]: NsCommand<TSchemas[Index]>;
};

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
