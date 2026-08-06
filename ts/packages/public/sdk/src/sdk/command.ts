import {
	cliOption,
	cliPositional,
	type CliOptionOptions,
	type CliPositionalOptions,
	type ClinkrCompletionCandidate,
	type ClinkrCompletionProviderRequest,
	type ContextfulCommandDefinition,
	type RenderCapabilities,
	type ResultOf,
} from "@nseng-ai/clinkr/app";
import type {
	ContextfulRawCommandDefinition,
	ContextfulRawCommandOptions,
} from "@nseng-ai/clinkr/raw";
import { z } from "zod";

import { createContextfulCommand, createContextfulRawCommand } from "./clinkr-command-adapter.ts";
import type { ExtensionDescriptor } from "./descriptor.ts";
import type { NsExtensionApi } from "./execution.ts";

export type {
	ClinkrCompletionCandidate,
	ClinkrCompletionProviderRequest,
	RenderCapabilities,
	ResultOf,
};
export type { CliOptionOptions as OptionSpec, CliPositionalOptions as PositionalSpec };

export type NsCommandSchema = z.ZodObject;
export type NsCommandRequest<S extends NsCommandSchema> = z.output<S>;
export type NsCommandCompletionRequest = ClinkrCompletionProviderRequest;
export type NsCommandCompletionCandidate = ClinkrCompletionCandidate;
export type NsCommandCompletionResult = readonly ClinkrCompletionCandidate[];
export type NsCommandCompletionProvider = (
	ctx: NsExtensionApi,
	request: NsCommandCompletionRequest,
) => Promise<NsCommandCompletionResult> | NsCommandCompletionResult;

export interface DefineCommandSpec<
	S extends NsCommandSchema,
	TResultSchema extends z.ZodType = z.ZodType,
> {
	/** Transitional compile-only fields consumed by the public Extension Kit; not retained in definitions. */
	readonly name?: string;
	readonly summary?: string;
	readonly description?: string;
	readonly schema: S;
	readonly resultSchema: TResultSchema;
	readonly handler: ContextfulCommandDefinition<NsExtensionApi, S, TResultSchema>["handler"];
	readonly renderHuman: (
		result: ResultOf<TResultSchema>,
		capabilities: RenderCapabilities,
	) => string;
	readonly renderMarkdown?: (
		result: ResultOf<TResultSchema>,
		capabilities: RenderCapabilities,
	) => string;
	readonly completionProvider?: NsCommandCompletionProvider;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, CliPositionalOptions>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, CliOptionOptions>>;
}

export type NsCommand<
	S extends NsCommandSchema = NsCommandSchema,
	TResultSchema extends z.ZodType = z.ZodType,
> = ContextfulCommandDefinition<NsExtensionApi, S, TResultSchema>;

export function defineCommand<S extends NsCommandSchema, TResultSchema extends z.ZodType>(
	spec: DefineCommandSpec<S, TResultSchema>,
): NsCommand<S, TResultSchema> {
	for (const [field, options] of Object.entries(spec.options ?? {})) {
		const schema = spec.schema.shape[field] as z.ZodType | undefined;
		if (schema !== undefined && options !== undefined) cliOption(schema, options);
	}
	for (const [field, options] of Object.entries(spec.positionals ?? {})) {
		const schema = spec.schema.shape[field] as z.ZodType | undefined;
		if (schema !== undefined && options !== undefined) cliPositional(schema, options);
	}
	return createContextfulCommand({
		requiresContext: true,
		schema: spec.schema,
		resultSchema: spec.resultSchema,
		renderHuman: spec.renderHuman,
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
		...(spec.completionProvider === undefined
			? {}
			: { completionProvider: spec.completionProvider }),
		handler: spec.handler,
	});
}

export type NsRawCommandOptions = ContextfulRawCommandOptions<NsExtensionApi>;
export type NsRawCommandDefinition = ContextfulRawCommandDefinition<NsExtensionApi>;

export function defineRawCommand(
	spec: Omit<NsRawCommandOptions, "requiresContext">,
): NsRawCommandDefinition {
	return createContextfulRawCommand({ ...spec, requiresContext: true });
}

export function defineExtension<const TDescriptor extends ExtensionDescriptor>(
	extension: TDescriptor,
): TDescriptor {
	return extension;
}
