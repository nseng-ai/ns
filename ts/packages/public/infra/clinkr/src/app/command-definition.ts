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

// This hierarchy keeps three contracts aligned. Schemas determine the request and result types.
// A data-bearing command must define renderHuman and can define renderMarkdown. A bodyless command
// does not need this rendering boilerplate because it has no output. The requiresContext property
// determines whether a callback receives a context argument. The result contract uses the
// ResultSchema union to create the data-bearing and bodyless variants. Each variant combines with one
// of the two direct execution shapes. Bivariant callbacks let concrete definitions safely use the
// broad command-definition type. The private input types also pin an omitted resultSchema to undefined.
// This constraint prevents handler return inference from changing a bodyless command into a
// data-bearing command.
type ResultSchema = z.ZodType | undefined;

export type ResultOf<TResultSchema extends ResultSchema> = TResultSchema extends z.ZodType
	? z.output<TResultSchema>
	: undefined;

type HandlerResult<TOutcome> = TOutcome | Promise<TOutcome>;

type BivariantCallback<TArguments extends readonly unknown[], TResult> = {
	invoke(...arguments_: TArguments): TResult;
}["invoke"];

type CommandRenderer<TResult> = BivariantCallback<
	[result: TResult, capabilities: RenderCapabilities],
	string
>;

interface DataBearingCommandResultContract<TResultSchema extends z.ZodType> {
	readonly resultSchema: TResultSchema;
	readonly renderHuman: CommandRenderer<ResultOf<TResultSchema>>;
	readonly renderMarkdown?: CommandRenderer<ResultOf<TResultSchema>>;
}

interface BodylessCommandResultContract {
	readonly resultSchema?: never;
	readonly renderHuman?: never;
	readonly renderMarkdown?: never;
}

type CommandResultContract<TResultSchema extends ResultSchema> = TResultSchema extends z.ZodType
	? DataBearingCommandResultContract<TResultSchema>
	: BodylessCommandResultContract;

interface SharedCommandDefinition<TSchema extends z.ZodObject> {
	readonly schema: TSchema;
}

interface ContextFreeCommandExecution<
	TSchema extends z.ZodObject,
	TResultSchema extends ResultSchema,
> {
	readonly requiresContext?: never;
	readonly handler: BivariantCallback<
		[request: z.output<TSchema>],
		HandlerResult<CommandOutcome<ResultOf<TResultSchema>>>
	>;
	readonly completionProvider?: (
		request: ClinkrCompletionProviderRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export type ContextFreeCommandDefinition<
	TSchema extends z.ZodObject = z.ZodObject,
	TResultSchema extends ResultSchema = ResultSchema,
> =
	| (DataBearingCommandResultContract<TResultSchema & z.ZodType> &
			SharedCommandDefinition<TSchema> &
			ContextFreeCommandExecution<TSchema, TResultSchema>)
	| (SharedCommandDefinition<TSchema> &
			BodylessCommandResultContract &
			ContextFreeCommandExecution<TSchema, TResultSchema>);

type ContextFreeCommandDefinitionInput<
	TSchema extends z.ZodObject,
	TResultSchema extends ResultSchema,
> =
	| (DataBearingCommandResultContract<TResultSchema & z.ZodType> &
			SharedCommandDefinition<TSchema> &
			ContextFreeCommandExecution<TSchema, TResultSchema>)
	| (SharedCommandDefinition<TSchema> &
			BodylessCommandResultContract &
			ContextFreeCommandExecution<TSchema, undefined>);

interface ContextfulCommandExecution<
	TContext,
	TSchema extends z.ZodObject,
	TResultSchema extends ResultSchema,
> {
	readonly requiresContext: true;
	readonly handler: BivariantCallback<
		[context: TContext, request: z.output<TSchema>],
		HandlerResult<CommandOutcome<ResultOf<TResultSchema>>>
	>;
	readonly completionProvider?: (
		context: TContext,
		request: ClinkrCompletionProviderRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export type ContextfulCommandDefinition<
	TContext,
	TSchema extends z.ZodObject = z.ZodObject,
	TResultSchema extends ResultSchema = ResultSchema,
> =
	| (DataBearingCommandResultContract<TResultSchema & z.ZodType> &
			SharedCommandDefinition<TSchema> &
			ContextfulCommandExecution<TContext, TSchema, TResultSchema>)
	| (SharedCommandDefinition<TSchema> &
			BodylessCommandResultContract &
			ContextfulCommandExecution<TContext, TSchema, TResultSchema>);

type ContextfulCommandDefinitionInput<
	TContext,
	TSchema extends z.ZodObject,
	TResultSchema extends ResultSchema,
> =
	| (DataBearingCommandResultContract<TResultSchema & z.ZodType> &
			SharedCommandDefinition<TSchema> &
			ContextfulCommandExecution<TContext, TSchema, TResultSchema>)
	| (SharedCommandDefinition<TSchema> &
			BodylessCommandResultContract &
			ContextfulCommandExecution<TContext, TSchema, undefined>);

export type ClinkrCommandDefinition<TContext = never> =
	| (SharedCommandDefinition<z.ZodObject> &
			CommandResultContract<ResultSchema> &
			ContextFreeCommandExecution<z.ZodObject, ResultSchema>)
	| (SharedCommandDefinition<z.ZodObject> &
			CommandResultContract<ResultSchema> &
			ContextfulCommandExecution<TContext, z.ZodObject, ResultSchema>);

export function defineCommand<
	TSchema extends z.ZodObject,
	// Omitted resultSchema means the command has a bodyless success outcome.
	TResultSchema extends ResultSchema = undefined,
>(
	definition: ContextFreeCommandDefinitionInput<TSchema, TResultSchema>,
): ContextFreeCommandDefinition<TSchema, TResultSchema>;
export function defineCommand<
	TContext,
	TSchema extends z.ZodObject,
	// Omitted resultSchema means the command has a bodyless success outcome.
	TResultSchema extends ResultSchema = undefined,
>(
	definition: ContextfulCommandDefinitionInput<TContext, TSchema, TResultSchema>,
): ContextfulCommandDefinition<TContext, TSchema, TResultSchema>;
export function defineCommand(
	definition: ClinkrCommandDefinition<unknown>,
): ClinkrCommandDefinition<unknown> {
	return definition;
}
