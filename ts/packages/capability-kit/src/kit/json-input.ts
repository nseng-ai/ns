import { readFile } from "node:fs/promises";

import { z } from "zod";

export interface JsonInputError {
	readonly errorType: "invalid-json" | "invalid-request";
	readonly message: string;
}

export type JsonInputResult<T> =
	| { readonly type: "ok"; readonly value: T }
	| { readonly type: "error"; readonly error: JsonInputError };

export interface ReadJsonInputTextOptions {
	readonly optionValue: string | undefined;
	readonly filePath?: string;
	readonly commandName: string;
	readonly inputDescription: string;
	readonly optionName: string;
	readonly fileOptionName?: string;
	readonly canReadStdin?: boolean;
	readonly stdin: () => Promise<string>;
}

export interface LoadJsonInputOptions<T> extends ReadJsonInputTextOptions {
	readonly schema: z.ZodType<T>;
}

export interface ParseJsonInputTextOptions<T> {
	readonly text: string;
	readonly schema: z.ZodType<T>;
	readonly jsonDescription: string;
	readonly schemaDescription?: string;
}

export interface ParseJsonInputValueOptions<T> {
	readonly value: unknown;
	readonly schema: z.ZodType<T>;
	readonly schemaDescription: string;
}

export async function loadJsonInput<T>(
	options: LoadJsonInputOptions<T>,
): Promise<JsonInputResult<T>> {
	const textResult = await readJsonInputText(options);
	if (textResult.type === "error") return textResult;

	return parseJsonInputText({
		text: textResult.value,
		schema: options.schema,
		jsonDescription: `${options.commandName} ${options.inputDescription}`,
		schemaDescription: `${options.commandName} ${options.inputDescription}`,
	});
}

export async function readJsonInputText(
	options: ReadJsonInputTextOptions,
): Promise<JsonInputResult<string>> {
	const canReadStdin = options.canReadStdin ?? true;
	const sourceCount =
		Number(options.optionValue !== undefined) + Number(options.filePath !== undefined);
	if (sourceCount > 1) {
		return {
			type: "error",
			error: {
				errorType: "invalid-request",
				message: `${options.commandName} accepts only one ${options.inputDescription} source; do not pass both ${options.optionName} and ${fileOptionName(options.fileOptionName)}.`,
			},
		};
	}

	const rawPayloadResult = await readRawPayload(options, canReadStdin);
	if (rawPayloadResult.type === "error") return rawPayloadResult;

	const sourceDescription = describeSources(
		options.optionName,
		options.fileOptionName,
		canReadStdin,
	);
	if (rawPayloadResult.value.trim() === "") {
		return {
			type: "error",
			error: {
				errorType: "invalid-request",
				message: `${options.commandName} requires a non-empty ${options.inputDescription} via ${sourceDescription}`,
			},
		};
	}
	return rawPayloadResult;
}

async function readRawPayload(
	options: ReadJsonInputTextOptions,
	canReadStdin: boolean,
): Promise<JsonInputResult<string>> {
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
			errorType: "invalid-request",
			message: `${options.commandName} requires ${options.inputDescription} via ${describeSources(options.optionName, options.fileOptionName, false)}.`,
		},
	};
}

interface ReadJsonInputFileOptions {
	readonly filePath: string;
	readonly commandName: string;
	readonly inputDescription: string;
	readonly fileOptionNameValue: string | undefined;
}

async function readJsonInputFile(
	options: ReadJsonInputFileOptions,
): Promise<JsonInputResult<string>> {
	try {
		return { type: "ok", value: await readFile(options.filePath, "utf8") };
	} catch {
		return {
			type: "error",
			error: {
				errorType: "invalid-request",
				message: `${options.commandName} ${fileOptionName(options.fileOptionNameValue)} must point to an existing file for ${options.inputDescription}: ${options.filePath}`,
			},
		};
	}
}

function describeSources(
	optionName: string,
	fileOptionNameValue: string | undefined,
	canReadStdin: boolean,
): string {
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

export function parseJsonInputText<T>(options: ParseJsonInputTextOptions<T>): JsonInputResult<T> {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(options.text);
	} catch (error) {
		return {
			type: "error",
			error: {
				errorType: "invalid-json",
				message: `Invalid ${options.jsonDescription}: ${jsonParseMessage(error)}`,
			},
		};
	}

	return parseJsonInputValue({
		value: parsedJson,
		schema: options.schema,
		schemaDescription: options.schemaDescription ?? options.jsonDescription,
	});
}

export function parseJsonInputValue<T>(options: ParseJsonInputValueOptions<T>): JsonInputResult<T> {
	const parseResult = options.schema.safeParse(options.value);
	if (!parseResult.success) {
		return {
			type: "error",
			error: {
				errorType: "invalid-request",
				message: `Invalid ${options.schemaDescription}: ${z.prettifyError(parseResult.error)}`,
			},
		};
	}
	return { type: "ok", value: parseResult.data };
}
