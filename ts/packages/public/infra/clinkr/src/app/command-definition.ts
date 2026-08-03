import { z } from "zod";

import {
	buildSurfacePlan,
	type OptionSpec,
	type PositionalSpec,
	type SurfacePlan,
} from "../surface.ts";
import { buildEnvelopeSchema, type CommandOutcome } from "./outcome.ts";

export interface ClinkrCommandMetadata {
	readonly description: string;
	readonly aliases?: readonly string[];
	readonly summary?: string;
	readonly hidden?: boolean;
	readonly helpGroup?: string;
	/** Presentation-only ordering within a scope; lower values render first. */
	readonly helpOrder?: number;
}

export type ClinkrGroupDefinition = ClinkrCommandMetadata;

export interface ClinkrCompletionRequest {
	/** Tokens after the executable name, including a trailing empty token after whitespace. */
	readonly words: readonly string[];
}

export interface ClinkrCompletionProviderRequest extends ClinkrCompletionRequest {
	readonly current: string;
	readonly previous: readonly string[];
	readonly args: readonly string[];
	readonly positionalIndex: number;
	/** Canonical command route, never an alias spelling. */
	readonly commandPath: readonly string[];
}

export type ClinkrCompletionCandidateType =
	| "command"
	| "option"
	| "option-value"
	| "positional-value";

export interface ClinkrCompletionCandidate {
	readonly value: string;
	readonly type: ClinkrCompletionCandidateType;
	readonly description?: string;
}

export interface ClinkrCompletionResult {
	readonly candidates: readonly ClinkrCompletionCandidate[];
}

export type CliOptionOptions = OptionSpec;

export type CliPositionalOptions = PositionalSpec;

type CliFieldAnnotation =
	| { readonly type: "option"; readonly options: CliOptionOptions }
	| { readonly type: "positional"; readonly options: CliPositionalOptions };

const cliAnnotations = z.registry<CliFieldAnnotation>();

function annotate(field: z.ZodType, annotation: CliFieldAnnotation): void {
	cliAnnotations.add(field, annotation);
}

export function cliOption<TField extends z.ZodType>(
	field: TField,
	options: CliOptionOptions,
): TField {
	annotate(field, { type: "option", options });
	return field;
}

export function cliPositional<TField extends z.ZodType>(
	field: TField,
	options: CliPositionalOptions,
): TField {
	annotate(field, { type: "positional", options });
	return field;
}

export function cliAnnotationFor(field: z.ZodType): CliFieldAnnotation | undefined {
	return cliAnnotations.get(field);
}

export function buildCommandSurfacePlan(
	commandName: string,
	definition: ClinkrCommandDefinition,
): SurfacePlan {
	const positionals: Record<string, PositionalSpec> = {};
	const optionSpecs: Record<string, OptionSpec> = {};
	for (const [key, field] of Object.entries(definition.schema.shape)) {
		const annotation = cliAnnotationFor(field as z.ZodType);
		if (annotation?.type === "positional") positionals[key] = annotation.options;
		if (annotation?.type === "option") optionSpecs[key] = annotation.options;
	}
	return buildSurfacePlan({
		commandName,
		schema: definition.schema,
		positionals,
		optionSpecs,
	});
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
		request: ClinkrCompletionProviderRequest,
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
		request: ClinkrCompletionProviderRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export type ClinkrCommandDefinition<TContext = never> =
	| ContextFreeCommandDefinition<z.ZodObject, ResultSchema>
	| ContextfulCommandDefinition<TContext, z.ZodObject, ResultSchema>;

export function defineCommand<
	TSchema extends z.ZodObject,
	// Omitted resultSchema means the command has a bodyless success outcome.
	TResultSchema extends ResultSchema = undefined,
>(
	definition: ContextFreeCommandDefinition<TSchema, TResultSchema>,
): ContextFreeCommandDefinition<TSchema, TResultSchema>;
export function defineCommand<
	TContext,
	TSchema extends z.ZodObject,
	// Omitted resultSchema means the command has a bodyless success outcome.
	TResultSchema extends ResultSchema = undefined,
>(
	definition: ContextfulCommandDefinition<TContext, TSchema, TResultSchema>,
): ContextfulCommandDefinition<TContext, TSchema, TResultSchema>;
export function defineCommand(
	definition: ClinkrCommandDefinition<unknown>,
): ClinkrCommandDefinition<unknown> {
	return definition;
}
