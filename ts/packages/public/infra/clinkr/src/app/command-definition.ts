import { z } from "zod";

import type { OptionSpec, PositionalSpec } from "../surface.ts";
import { buildEnvelopeSchema, type CommandOutcome } from "./outcome.ts";

export interface ClinkrCommandMetadata {
	readonly description: string;
	readonly summary?: string;
	readonly aliases?: readonly string[];
	readonly hidden?: boolean;
	readonly helpGroup?: string;
}

export type ClinkrGroupDefinition = ClinkrCommandMetadata;

export interface ClinkrCompletionRequest {
	readonly current: string;
}

export interface ClinkrCompletionCandidate {
	readonly value: string;
	readonly type: "positional-value" | "option-value";
}

export interface CliOptionOptions extends OptionSpec {
	readonly description?: string;
}

export interface CliPositionalOptions extends PositionalSpec {
	readonly description?: string;
}

type CliFieldAnnotation =
	| { readonly type: "option"; readonly options: CliOptionOptions }
	| { readonly type: "positional"; readonly options: CliPositionalOptions };

const annotations = new WeakMap<z.ZodType, CliFieldAnnotation>();

export function cliOption<TField extends z.ZodType>(
	field: TField,
	options: CliOptionOptions,
): TField {
	annotations.set(field, { type: "option", options });
	return field;
}

export function cliPositional<TField extends z.ZodType>(
	field: TField,
	options: CliPositionalOptions,
): TField {
	annotations.set(field, { type: "positional", options });
	return field;
}

export function cliAnnotationFor(field: z.ZodType): CliFieldAnnotation | undefined {
	return annotations.get(field);
}

export interface ClinkrCommandJsonSchemaDocument {
	readonly inputJsonSchema: unknown;
	readonly outputJsonSchema: unknown;
	readonly machineEnvelopeJsonSchema: unknown;
}

export function buildCommandJsonSchemaDocument<TContext>(
	definition: ClinkrCommandDefinition<TContext>,
): ClinkrCommandJsonSchemaDocument {
	return {
		inputJsonSchema: z.toJSONSchema(definition.schema, { io: "input" }),
		outputJsonSchema:
			definition.resultSchema === undefined
				? {}
				: z.toJSONSchema(definition.resultSchema, { io: "output" }),
		machineEnvelopeJsonSchema: z.toJSONSchema(buildEnvelopeSchema(definition.resultSchema), {
			io: "output",
		}),
	};
}

export interface RenderCapabilities {
	/** Whether the renderer may emit ANSI styling. */
	readonly canEmitAnsi: boolean;
}

type ResultSchema = z.ZodType | undefined;

export type ResultOf<TResultSchema extends ResultSchema> = TResultSchema extends z.ZodType
	? z.output<TResultSchema>
	: undefined;

type HandlerResult<TOutcome> = TOutcome | Promise<TOutcome>;

interface CommandDefinitionBase<TSchema extends z.ZodObject, TResultSchema extends ResultSchema> {
	readonly schema: TSchema;
	readonly resultSchema?: TResultSchema;
	readonly renderHuman?: (
		result: ResultOf<TResultSchema>,
		capabilities: RenderCapabilities,
	) => string;
	readonly renderMarkdown?: (
		result: ResultOf<TResultSchema>,
		capabilities: RenderCapabilities,
	) => string;
}

export interface ContextFreeCommandDefinition<
	TSchema extends z.ZodObject = z.ZodObject,
	TResultSchema extends ResultSchema = ResultSchema,
> extends CommandDefinitionBase<TSchema, TResultSchema> {
	readonly requiresContext?: false;
	readonly handler: (
		request: z.output<TSchema>,
	) => HandlerResult<CommandOutcome<ResultOf<TResultSchema>>>;
	readonly completionProvider?: (
		request: ClinkrCompletionRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export interface ContextfulCommandDefinition<
	TContext,
	TSchema extends z.ZodObject = z.ZodObject,
	TResultSchema extends ResultSchema = ResultSchema,
> extends CommandDefinitionBase<TSchema, TResultSchema> {
	readonly requiresContext: true;
	readonly handler: (
		context: TContext,
		request: z.output<TSchema>,
	) => HandlerResult<CommandOutcome<ResultOf<TResultSchema>>>;
	readonly completionProvider?: (
		context: TContext,
		request: ClinkrCompletionRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export type ClinkrCommandDefinition<TContext = never> =
	| ContextFreeCommandDefinition<z.ZodObject, ResultSchema>
	| ContextfulCommandDefinition<TContext, z.ZodObject, ResultSchema>;

export function defineCommand<
	TSchema extends z.ZodObject,
	TResultSchema extends ResultSchema = undefined,
>(
	definition: ContextFreeCommandDefinition<TSchema, TResultSchema>,
): ContextFreeCommandDefinition<TSchema, TResultSchema>;
export function defineCommand<
	TContext,
	TSchema extends z.ZodObject,
	TResultSchema extends ResultSchema = undefined,
>(
	definition: ContextfulCommandDefinition<TContext, TSchema, TResultSchema>,
): ContextfulCommandDefinition<TContext, TSchema, TResultSchema>;
export function defineCommand(
	definition: ClinkrCommandDefinition<unknown>,
): ClinkrCommandDefinition<unknown> {
	return definition;
}
