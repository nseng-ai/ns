import { z } from "zod";

import type { ClinkrInteraction } from "./confirmation.ts";
import type {
	ClinkrFailureExit,
	ClinkrNegativeExit,
	ClinkrOkExit,
	ClinkrUsageErrorExit,
} from "./exit.ts";
import type { RenderCapabilities } from "./emit.ts";
import type { OptionSpec, PositionalSpec } from "./surface.ts";

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
		machineEnvelopeJsonSchema: z.toJSONSchema(buildCommandMachineEnvelopeSchema(definition), {
			io: "output",
		}),
	};
}

function buildCommandMachineEnvelopeSchema<TContext>(
	definition: ClinkrCommandDefinition<TContext>,
) {
	const success = statusEnvelopeSchema("success", 0, definition.resultSchema);
	const negative = z.strictObject({
		status: z.literal("negative"),
		exitCode: z.literal(1),
		message: z.string(),
		...(definition.negativeSchema === undefined ? {} : { data: definition.negativeSchema }),
	});
	const failure = z.strictObject({
		status: z.literal("failure"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		...(definition.failureSchema === undefined ? {} : { data: definition.failureSchema }),
	});
	const handlerUsageError = z.strictObject({
		status: z.literal("usage-error"),
		exitCode: z.literal(2),
		errorType: z.string(),
		message: z.string(),
		...(definition.usageErrorSchema === undefined ? {} : { data: definition.usageErrorSchema }),
	});
	const frameworkBodylessUsageError = z.strictObject({
		status: z.literal("usage-error"),
		exitCode: z.literal(2),
		errorType: z.union([z.literal("invalid-request"), z.literal("invalid-json-input")]),
		message: z.string(),
	});
	const commanderUsageError = z.strictObject({
		status: z.literal("usage-error"),
		exitCode: z.literal(2),
		errorType: z.literal("invalid-request"),
		message: z.string(),
		data: z.strictObject({ commanderCode: z.string() }),
	});
	const requestUsageError = z.strictObject({
		status: z.literal("usage-error"),
		exitCode: z.literal(2),
		errorType: z.union([z.literal("invalid-request"), z.literal("invalid-json-input")]),
		message: z.string(),
		data: z.strictObject({ issues: z.array(z.unknown()) }),
	});
	return z.union([
		success,
		negative,
		failure,
		handlerUsageError,
		frameworkBodylessUsageError,
		commanderUsageError,
		requestUsageError,
	]);
}

function statusEnvelopeSchema(status: "success", exitCode: 0, dataSchema: z.ZodType | undefined) {
	return z.strictObject({
		status: z.literal(status),
		exitCode: z.literal(exitCode),
		...(dataSchema === undefined ? {} : { data: dataSchema }),
	});
}

type OutcomeSchema = z.ZodType | undefined;

export interface ClinkrOutcomeSchemaSet<
	TResultSchema extends OutcomeSchema = OutcomeSchema,
	TNegativeSchema extends OutcomeSchema = OutcomeSchema,
	TFailureSchema extends OutcomeSchema = OutcomeSchema,
	TUsageErrorSchema extends OutcomeSchema = OutcomeSchema,
> {
	readonly resultSchema: TResultSchema;
	readonly negativeSchema: TNegativeSchema;
	readonly failureSchema: TFailureSchema;
	readonly usageErrorSchema: TUsageErrorSchema;
}

type BodylessOutcomeSchemaSet = ClinkrOutcomeSchemaSet<undefined, undefined, undefined, undefined>;

type SchemaData<TSchema extends OutcomeSchema> = TSchema extends z.ZodType
	? z.output<TSchema>
	: never;

type SchemaOutcome<TSchema extends OutcomeSchema, TOutcome> = TSchema extends z.ZodType
	? TOutcome & { readonly data: SchemaData<TSchema> }
	: TOutcome;

export type ClinkrCommandOutcome<TSchemas extends ClinkrOutcomeSchemaSet> =
	| SchemaOutcome<TSchemas["resultSchema"], ClinkrOkExit<SchemaData<TSchemas["resultSchema"]>>>
	| SchemaOutcome<
			TSchemas["negativeSchema"],
			ClinkrNegativeExit<SchemaData<TSchemas["negativeSchema"]>>
	  >
	| SchemaOutcome<
			TSchemas["failureSchema"],
			ClinkrFailureExit<SchemaData<TSchemas["failureSchema"]>>
	  >
	| SchemaOutcome<
			TSchemas["usageErrorSchema"],
			ClinkrUsageErrorExit<SchemaData<TSchemas["usageErrorSchema"]>>
	  >;

type HandlerResult<TOutcome> = TOutcome | Promise<TOutcome>;

interface CommandDefinitionBase<
	TSchema extends z.ZodObject,
	TSchemas extends ClinkrOutcomeSchemaSet,
> {
	readonly schema: TSchema;
	readonly resultSchema?: TSchemas["resultSchema"];
	readonly negativeSchema?: TSchemas["negativeSchema"];
	readonly failureSchema?: TSchemas["failureSchema"];
	readonly usageErrorSchema?: TSchemas["usageErrorSchema"];
	readonly renderHuman?: (
		result: SchemaData<TSchemas["resultSchema"]>,
		capabilities: RenderCapabilities,
	) => string;
	readonly renderMarkdown?: (
		result: SchemaData<TSchemas["resultSchema"]>,
		capabilities: RenderCapabilities,
	) => string;
}

export interface ContextFreeCommandDefinition<
	TSchema extends z.ZodObject = z.ZodObject,
	TSchemas extends ClinkrOutcomeSchemaSet = BodylessOutcomeSchemaSet,
> extends CommandDefinitionBase<TSchema, TSchemas> {
	readonly requiresContext?: false;
	readonly handler: (request: z.output<TSchema>) => HandlerResult<ClinkrCommandOutcome<TSchemas>>;
	readonly completionProvider?: (
		request: ClinkrCompletionRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export interface ContextfulCommandDefinition<
	TContext,
	TSchema extends z.ZodObject = z.ZodObject,
	TSchemas extends ClinkrOutcomeSchemaSet = BodylessOutcomeSchemaSet,
> extends CommandDefinitionBase<TSchema, TSchemas> {
	readonly requiresContext: true;
	readonly handler: (
		context: TContext,
		request: z.output<TSchema>,
	) => HandlerResult<ClinkrCommandOutcome<TSchemas>>;
	readonly completionProvider?: (
		context: TContext,
		request: ClinkrCompletionRequest,
	) => readonly ClinkrCompletionCandidate[] | Promise<readonly ClinkrCompletionCandidate[]>;
}

export type ClinkrCommandDefinition<TContext = never> =
	| ContextFreeCommandDefinition<z.ZodObject, ClinkrOutcomeSchemaSet>
	| ContextfulCommandDefinition<TContext, z.ZodObject, ClinkrOutcomeSchemaSet>;

export function defineCommand<
	TSchema extends z.ZodObject,
	TResultSchema extends OutcomeSchema = undefined,
	TNegativeSchema extends OutcomeSchema = undefined,
	TFailureSchema extends OutcomeSchema = undefined,
	TUsageErrorSchema extends OutcomeSchema = undefined,
>(
	definition: ContextFreeCommandDefinition<
		TSchema,
		ClinkrOutcomeSchemaSet<TResultSchema, TNegativeSchema, TFailureSchema, TUsageErrorSchema>
	>,
): ContextFreeCommandDefinition<
	TSchema,
	ClinkrOutcomeSchemaSet<TResultSchema, TNegativeSchema, TFailureSchema, TUsageErrorSchema>
>;
export function defineCommand<
	TContext,
	TSchema extends z.ZodObject,
	TResultSchema extends OutcomeSchema = undefined,
	TNegativeSchema extends OutcomeSchema = undefined,
	TFailureSchema extends OutcomeSchema = undefined,
	TUsageErrorSchema extends OutcomeSchema = undefined,
>(
	definition: ContextfulCommandDefinition<
		TContext,
		TSchema,
		ClinkrOutcomeSchemaSet<TResultSchema, TNegativeSchema, TFailureSchema, TUsageErrorSchema>
	>,
): ContextfulCommandDefinition<
	TContext,
	TSchema,
	ClinkrOutcomeSchemaSet<TResultSchema, TNegativeSchema, TFailureSchema, TUsageErrorSchema>
>;
export function defineCommand(
	definition: ClinkrCommandDefinition<unknown>,
): ClinkrCommandDefinition<unknown> {
	return definition;
}

export interface ClinkrCommandContextWithInteraction {
	readonly interaction: ClinkrInteraction;
}
