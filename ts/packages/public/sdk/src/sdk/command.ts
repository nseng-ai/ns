import {
	cliOption,
	cliPositional,
	type CliOptionOptions,
	type CliPositionalOptions,
	type ClinkrCompletionCandidate,
	type ClinkrCompletionProviderRequest,
	type CommandOutcome,
	type ContextfulCommandDefinition,
	type RenderCapabilities,
} from "@nseng-ai/clinkr/app";
import type {
	ContextfulRawCommandDefinition,
	ContextfulRawCommandOptions,
} from "@nseng-ai/clinkr/raw";
import { z } from "zod";

import { createContextfulCommand, createContextfulRawCommand } from "./clinkr-command-adapter.ts";
import type { ExtensionDescriptor } from "./descriptor.ts";
import type { NsExtensionApi } from "./execution.ts";

export type { ClinkrCompletionCandidate, ClinkrCompletionProviderRequest, RenderCapabilities };
export type { CliOptionOptions as OptionSpec, CliPositionalOptions as PositionalSpec };

export type NsCommandSchema = z.ZodObject;
export type NsCommandInputSchema = NsCommandSchema | z.ZodLazy<NsCommandSchema>;
export type NsCommandRequest<S extends NsCommandInputSchema> = z.output<S>;
export type NsCommandCompletionRequest = ClinkrCompletionProviderRequest;
export type NsCommandCompletionCandidate = ClinkrCompletionCandidate;
export type NsCommandCompletionResult = readonly ClinkrCompletionCandidate[];
export type NsCommandCompletionProvider = (
	ctx: NsExtensionApi,
	request: NsCommandCompletionRequest,
) => Promise<NsCommandCompletionResult> | NsCommandCompletionResult;

export interface DefineCommandSpec<S extends NsCommandInputSchema, T = unknown> {
	/** Transitional compile-only fields consumed by the public Extension Kit; not retained in definitions. */
	readonly name?: string;
	readonly summary?: string;
	readonly description?: string;
	readonly schema: S;
	readonly resultSchema?: z.ZodType<T>;
	readonly handler: (
		context: NsExtensionApi,
		request: z.output<S>,
	) => CommandOutcome<T> | Promise<CommandOutcome<T>>;
	readonly renderHuman?: (result: T, capabilities: RenderCapabilities) => string;
	readonly renderMarkdown?: (result: T, capabilities: RenderCapabilities) => string;
	readonly completionProvider?: NsCommandCompletionProvider;
	readonly positionals?: Partial<Record<keyof z.infer<S> & string, CliPositionalOptions>>;
	readonly options?: Partial<Record<keyof z.infer<S> & string, CliOptionOptions>>;
}

export type NsCommand<
	S extends NsCommandSchema = NsCommandSchema,
	T = unknown,
> = ContextfulCommandDefinition<NsExtensionApi, S, z.ZodType<T>>;

export function defineCommand<S extends NsCommandSchema, T = unknown>(
	spec: DefineCommandSpec<S, T>,
): NsCommand<S, T>;
export function defineCommand<S extends NsCommandSchema, T = unknown>(
	spec: DefineCommandSpec<z.ZodLazy<S>, T>,
): NsCommand<S, T>;
export function defineCommand(spec: DefineCommandSpec<NsCommandInputSchema, unknown>): NsCommand {
	// Parsing follows ZodLazy transparently, but CLI surface reflection requires the object's shape.
	const commandSchema = spec.schema instanceof z.ZodLazy ? spec.schema.unwrap() : spec.schema;
	for (const [field, options] of Object.entries(spec.options ?? {})) {
		const schema = commandSchema.shape[field] as z.ZodType | undefined;
		if (schema !== undefined && options !== undefined) cliOption(schema, options);
	}
	for (const [field, options] of Object.entries(spec.positionals ?? {})) {
		const schema = commandSchema.shape[field] as z.ZodType | undefined;
		if (schema !== undefined && options !== undefined) cliPositional(schema, options);
	}
	return createContextfulCommand({
		requiresContext: true,
		schema: commandSchema,
		...(spec.resultSchema === undefined ? {} : { resultSchema: spec.resultSchema }),
		...(spec.renderHuman === undefined ? {} : { renderHuman: spec.renderHuman }),
		...(spec.renderMarkdown === undefined ? {} : { renderMarkdown: spec.renderMarkdown }),
		...(spec.completionProvider === undefined
			? {}
			: { completionProvider: spec.completionProvider }),
		handler: (context, request) => spec.handler(context, request),
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
