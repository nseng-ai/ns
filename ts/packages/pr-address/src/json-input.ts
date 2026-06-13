import { readFile } from "node:fs/promises";

import { z } from "zod";

import { isRecord } from "@asdl/core";
import type { PayloadArtifactStore, PayloadErrorType } from "./payload-store.ts";

export interface JsonInputError {
	errorType: "invalid_json" | "invalid_request" | PayloadErrorType;
	message: string;
}

export type JsonInputResult<T> = { type: "ok"; value: T } | { type: "error"; error: JsonInputError };

export interface ReadJsonInputTextOptions {
	optionValue: string | undefined;
	filePath?: string | undefined;
	commandName: string;
	inputDescription: string;
	optionName: string;
	fileOptionName?: string | undefined;
	canReadStdin?: boolean | undefined;
	stdin: () => Promise<string>;
}

export interface LoadJsonInputOptions<T> extends ReadJsonInputTextOptions {
	schema: z.ZodType<T>;
}

export async function readJsonInputText(options: ReadJsonInputTextOptions): Promise<JsonInputResult<string>> {
	const canReadStdin = options.canReadStdin ?? true;
	const sourceCount = Number(options.optionValue !== undefined) + Number(options.filePath !== undefined);
	if (sourceCount > 1) {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `${options.commandName} accepts only one ${options.inputDescription} source; do not pass both ${options.optionName} and ${fileOptionName(options.fileOptionName)}.`,
			},
		};
	}

	const rawPayloadResult = await readRawPayload(options, canReadStdin);
	if (rawPayloadResult.type === "error") return rawPayloadResult;

	const sourceDescription = describeSources(options.optionName, options.fileOptionName, canReadStdin);
	if (rawPayloadResult.value.trim() === "") {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `${options.commandName} requires a non-empty ${options.inputDescription} via ${sourceDescription}`,
			},
		};
	}
	return rawPayloadResult;
}

export interface LoadArtifactReferenceOptions<T> {
	filePath: string;
	commandName: string;
	optionName: string;
	artifactDescription: string;
	schema: z.ZodType<T>;
	store?: PayloadArtifactStore | undefined;
}

export interface ResolveXorSourceInputOptions<T> {
	commandName: string;
	embeddedValue: T | undefined;
	embeddedKey: string;
	referencePath: string | undefined;
	optionName: string;
	artifactDescription: string;
	referenceSchema: z.ZodType<T>;
	inputName?: string | undefined;
	store?: PayloadArtifactStore | undefined;
}

export interface OperationPayloadField<TPayload extends object, TKey extends keyof TPayload & string> {
	key: TKey;
	artifactDescription: string;
	referenceSchema: z.ZodType<TPayload[TKey]>;
	inputName?: string | undefined;
}

export interface LoadOperationPayloadOptions<TPayload extends object> {
	commandName: string;
	inputDescription: string;
	payloadSchema: z.ZodType<TPayload>;
	/** Parsed clinkr request record; payload sources read snake_case keys. */
	request: Readonly<Record<string, unknown>>;
	stdin: () => Promise<string>;
	fields: readonly OperationPayloadField<TPayload, keyof TPayload & string>[];
	store?: PayloadArtifactStore | undefined;
	canOmitPayloadWhenAllFieldsReferenced?: boolean | undefined;
}

/**
 * Read and validate a store-owned artifact referenced by a CLI path option.
 * Validation is structural only: references may come from any payload session,
 * so provenance is deliberately not checked.
 */
export async function loadArtifactReference<T>(options: LoadArtifactReferenceOptions<T>): Promise<JsonInputResult<T>> {
	if (options.store !== undefined) {
		const artifactResult = await options.store.readJsonArtifact({ payloadPath: options.filePath });
		if (artifactResult.type === "ok") {
			return parseJsonValueWithSchema({
				value: artifactResult.value,
				schema: options.schema,
				schemaDescription: `${options.commandName} ${options.optionName}`,
			});
		}
	}

	const fileResult = await readJsonInputFile({
		filePath: options.filePath,
		commandName: options.commandName,
		inputDescription: options.artifactDescription,
		fileOptionNameValue: options.optionName,
	});
	if (fileResult.type === "error") return fileResult;

	return parseJsonWithSchema({
		text: fileResult.value,
		schema: options.schema,
		jsonDescription: `${options.commandName} ${options.optionName} file`,
		schemaDescription: `${options.commandName} ${options.optionName}`,
	});
}

/** Resolve one input from exactly one source: an embedded payload key or its reference option. */
export async function resolveXorSourceInput<T>(options: ResolveXorSourceInputOptions<T>): Promise<JsonInputResult<T>> {
	const inputName = options.inputName ?? options.embeddedKey;
	if (options.referencePath === undefined) {
		if (options.embeddedValue === undefined) {
			return {
				type: "error",
				error: {
					errorType: "invalid_request",
					message: `${options.commandName} requires a ${inputName} input via the payload ${options.embeddedKey} key or ${options.optionName}.`,
				},
			};
		}
		return { type: "ok", value: options.embeddedValue };
	}
	if (options.embeddedValue !== undefined) {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `${options.commandName} cannot mix an embedded ${options.embeddedKey} payload key with ${options.optionName}; pass exactly one ${inputName} source.`,
			},
		};
	}
	return await loadArtifactReference({
		filePath: options.referencePath,
		commandName: options.commandName,
		optionName: options.optionName,
		artifactDescription: options.artifactDescription,
		schema: options.referenceSchema,
		store: options.store,
	});
}

/** Flag spelling for a payload-field reference; used in error wording. */
export function operationPayloadReferenceOption(key: string): `--${string}` {
	return `--${key.replaceAll("_", "-")}-reference`;
}

/** Parsed-request key for a payload-field reference (snake_case, clinkr-derived). */
export function operationPayloadReferenceKey(key: string): string {
	return `${key}_reference`;
}

export async function loadOperationPayload<TPayload extends object>(
	options: LoadOperationPayloadOptions<TPayload>,
): Promise<JsonInputResult<TPayload>> {
	const payloadJson = stringRequestField(options.request, "payload_json");
	const payloadFile = stringRequestField(options.request, "payload_file");
	const hasPayloadOption = payloadJson !== undefined || payloadFile !== undefined;
	const hasAllReferences =
		options.fields.length > 0 &&
		options.fields.every((field) => stringRequestField(options.request, operationPayloadReferenceKey(field.key)) !== undefined);
	const shouldLoadPayload = hasPayloadOption || (options.canOmitPayloadWhenAllFieldsReferenced !== true || !hasAllReferences);
	const resolvedPayload: Record<string, unknown> = {};
	if (shouldLoadPayload) {
		const payloadResult = await loadJsonInput({
			optionValue: payloadJson,
			filePath: payloadFile,
			commandName: options.commandName,
			inputDescription: options.inputDescription,
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema: options.payloadSchema,
			stdin: options.stdin,
		});
		if (payloadResult.type === "error") return payloadResult;
		Object.assign(resolvedPayload, payloadResult.value);
	}
	for (const field of options.fields) {
		const result = await resolveXorSourceInput({
			commandName: options.commandName,
			embeddedValue: resolvedPayload[field.key],
			embeddedKey: field.key,
			referencePath: stringRequestField(options.request, operationPayloadReferenceKey(field.key)),
			optionName: operationPayloadReferenceOption(field.key),
			artifactDescription: field.artifactDescription,
			referenceSchema: field.referenceSchema,
			inputName: field.inputName,
			store: options.store,
		});
		if (result.type === "error") return result;
		resolvedPayload[field.key] = result.value;
	}
	// Validate assembled payload. Every field was individually validated, so this
	// should never fail unless field specs disagree with payload schema (programmer error).
	const finalParseResult = options.payloadSchema.safeParse(resolvedPayload);
	if (!finalParseResult.success) {
		throw new Error(`Operation payload schema rejected individually-validated fields: ${z.prettifyError(finalParseResult.error)}`);
	}
	// All fields in the fields list were resolved and must be present in the validated data.
	for (const field of options.fields) {
		if (!(field.key in finalParseResult.data)) {
			throw new Error(`Operation payload field ${field.key} missing after validation despite successful field resolution.`);
		}
	}
	return { type: "ok", value: finalParseResult.data };
}

function stringRequestField(request: Readonly<Record<string, unknown>>, key: string): string | undefined {
	const value = request[key];
	return typeof value === "string" ? value : undefined;
}

export async function loadJsonInput<T>(options: LoadJsonInputOptions<T>): Promise<JsonInputResult<T>> {
	const textResult = await readJsonInputText(options);
	if (textResult.type === "error") return textResult;

	return parseJsonWithSchema({
		text: textResult.value,
		schema: options.schema,
		jsonDescription: `${options.commandName} ${options.inputDescription}`,
		schemaDescription: `${options.commandName} ${options.inputDescription}`,
	});
}

export interface LoadJsonRecordOptions extends ReadJsonInputTextOptions {}

/**
 * Load JSON input that must be a record/object.
 * Preserves legacy "JSON must be an object" error wording for byte-level fixture stability.
 */
export async function loadJsonRecord(options: LoadJsonRecordOptions): Promise<JsonInputResult<Record<string, unknown>>> {
	const textResult = await readJsonInputText(options);
	if (textResult.type === "error") return textResult;

	let parsed: unknown;
	try {
		parsed = JSON.parse(textResult.value);
	} catch (error) {
		return {
			type: "error",
			error: {
				errorType: "invalid_json",
				message: `Invalid ${options.commandName} ${options.inputDescription}: ${jsonParseMessage(error)}`,
			},
		};
	}

	if (!isRecord(parsed)) {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `${options.commandName} ${options.inputDescription} JSON must be an object.`,
			},
		};
	}

	return { type: "ok", value: parsed };
}

async function readRawPayload(options: ReadJsonInputTextOptions, canReadStdin: boolean): Promise<JsonInputResult<string>> {
	if (options.optionValue !== undefined) return { type: "ok", value: options.optionValue };
	if (options.filePath !== undefined) {
		return await readJsonInputFile({
			filePath: options.filePath,
			commandName: options.commandName,
			inputDescription: options.inputDescription,
			fileOptionNameValue: options.fileOptionName,
		});
	}
	if (canReadStdin) return { type: "ok", value: await options.stdin() };

	return {
		type: "error",
		error: {
			errorType: "invalid_request",
			message: `${options.commandName} requires ${options.inputDescription} via ${describeSources(options.optionName, options.fileOptionName, false)}.`,
		},
	};
}

interface ReadJsonInputFileOptions {
	filePath: string;
	commandName: string;
	inputDescription: string;
	fileOptionNameValue: string | undefined;
}

async function readJsonInputFile(options: ReadJsonInputFileOptions): Promise<JsonInputResult<string>> {
	try {
		return { type: "ok", value: await readFile(options.filePath, "utf8") };
	} catch {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `${options.commandName} ${fileOptionName(options.fileOptionNameValue)} must point to an existing file for ${options.inputDescription}: ${options.filePath}`,
			},
		};
	}
}

function describeSources(optionName: string, fileOptionNameValue: string | undefined, canReadStdin: boolean): string {
	const sources: string[] = [];
	if (canReadStdin) sources.push("stdin");
	sources.push(optionName);
	if (fileOptionNameValue !== undefined) sources.push(fileOptionNameValue);
	if (sources.length === 1) return sources[0] ?? optionName;
	if (sources.length === 2) return `${sources[0]} or ${sources[1]}`;
	return `${sources.slice(0, -1).join(", ")}, or ${sources.at(-1)}`;
}

function fileOptionName(fileOptionNameValue: string | undefined): string {
	return fileOptionNameValue ?? "file path";
}

function jsonParseMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Parse JSON text and validate with Zod schema, returning structured errors.
 * @param text - Raw JSON text to parse
 * @param schema - Zod schema for validation
 * @param jsonDescription - Descriptor for JSON parsing errors (e.g., "demo payload")
 * @param schemaDescription - Descriptor for schema validation errors (e.g., "demo payload")
 */
export interface ParseJsonWithSchemaOptions<T> {
	text: string;
	schema: z.ZodType<T>;
	jsonDescription: string;
	schemaDescription: string;
}

export function parseJsonWithSchema<T>(options: ParseJsonWithSchemaOptions<T>): JsonInputResult<T> {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(options.text);
	} catch (error) {
		return {
			type: "error",
			error: {
				errorType: "invalid_json",
				message: `Invalid ${options.jsonDescription}: ${jsonParseMessage(error)}`,
			},
		};
	}

	return parseJsonValueWithSchema({ value: parsedJson, schema: options.schema, schemaDescription: options.schemaDescription });
}

function parseJsonValueWithSchema<T>(options: { value: unknown; schema: z.ZodType<T>; schemaDescription: string }): JsonInputResult<T> {
	const parseResult = options.schema.safeParse(options.value);
	if (!parseResult.success) {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `Invalid ${options.schemaDescription}: ${z.prettifyError(parseResult.error)}`,
			},
		};
	}
	return { type: "ok", value: parseResult.data };
}
