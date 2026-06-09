import { readFile } from "node:fs/promises";

import { z } from "zod";

export interface JsonInputError {
	errorType: "invalid_json" | "invalid_request";
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
	allowStdin?: boolean | undefined;
	stdin: () => Promise<string>;
}

export interface LoadJsonInputOptions<T> extends ReadJsonInputTextOptions {
	schema: z.ZodType<T>;
}

export async function readJsonInputText(options: ReadJsonInputTextOptions): Promise<JsonInputResult<string>> {
	const allowStdin = options.allowStdin ?? true;
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

	const rawPayloadResult = await readRawPayload(options, allowStdin);
	if (rawPayloadResult.type === "error") return rawPayloadResult;

	const sourceDescription = describeSources(options.optionName, options.fileOptionName, allowStdin);
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

export async function loadJsonInput<T>(options: LoadJsonInputOptions<T>): Promise<JsonInputResult<T>> {
	const textResult = await readJsonInputText(options);
	if (textResult.type === "error") return textResult;

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(textResult.value);
	} catch (error) {
		return {
			type: "error",
			error: {
				errorType: "invalid_json",
				message: `Invalid ${options.commandName} ${options.inputDescription}: ${jsonParseMessage(error)}`,
			},
		};
	}

	const parseResult = options.schema.safeParse(parsedJson);
	if (!parseResult.success) {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `Invalid ${options.commandName} ${options.inputDescription}: ${z.prettifyError(parseResult.error)}`,
			},
		};
	}
	return { type: "ok", value: parseResult.data };
}

async function readRawPayload(options: ReadJsonInputTextOptions, allowStdin: boolean): Promise<JsonInputResult<string>> {
	if (options.optionValue !== undefined) return { type: "ok", value: options.optionValue };
	if (options.filePath !== undefined) return await readJsonInputFile(options.filePath, options.commandName, options.inputDescription, options.fileOptionName);
	if (allowStdin) return { type: "ok", value: await options.stdin() };

	return {
		type: "error",
		error: {
			errorType: "invalid_request",
			message: `${options.commandName} requires ${options.inputDescription} via ${describeSources(options.optionName, options.fileOptionName, false)}.`,
		},
	};
}

async function readJsonInputFile(
	filePath: string,
	commandName: string,
	inputDescription: string,
	fileOptionNameValue: string | undefined,
): Promise<JsonInputResult<string>> {
	try {
		return { type: "ok", value: await readFile(filePath, "utf8") };
	} catch {
		return {
			type: "error",
			error: {
				errorType: "invalid_request",
				message: `${commandName} ${fileOptionName(fileOptionNameValue)} must point to an existing file for ${inputDescription}: ${filePath}`,
			},
		};
	}
}

function describeSources(optionName: string, fileOptionNameValue: string | undefined, allowStdin: boolean): string {
	const sources: string[] = [];
	if (allowStdin) sources.push("stdin");
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
