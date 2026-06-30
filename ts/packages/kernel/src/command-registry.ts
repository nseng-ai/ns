import { z } from "zod";

import {
	failed,
	type ClinkrExit,
	type SdlCommand,
	type SdlCommandSchema,
	type SdlExtensionApi,
	type SdlResult,
} from "sdl-sdk";

export type SdlCommandSourceLevel = "built-in" | "first-party" | "global" | "project";

export interface SdlCommandPath {
	group?: string;
	name: string;
	segments?: readonly string[];
	groupDescription?: string;
}

export interface SdlCommandSourceInfo {
	level: SdlCommandSourceLevel;
	label: string;
	path?: string;
}

export interface SdlCommandInfo extends SdlCommandPath {
	description: string;
}

export interface SdlCommandCliInfo extends SdlCommandInfo {
	fullDescription: string;
	groupDescription?: string;
}

export interface SdlCommandCandidate extends SdlCommandCliInfo {
	source: SdlCommandSourceInfo;
	entryPath?: string;
}

export interface BuiltInSdlCommandCandidate extends SdlCommandCandidate {
	source: SdlCommandSourceInfo & { level: "built-in" };
	command: SdlCommand;
}

export interface BuiltInCommandDefinition {
	command: SdlCommand;
	summary: string;
	description: string;
}

export const SDL_COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const SDL_COMMAND_NAME_RULE = "[a-z][a-z0-9-]*";

export const builtInCommandDefinitions: Readonly<Record<string, BuiltInCommandDefinition>> = {};

const sdlCommandSchema = z.object({
	name: z.string(),
	summary: z.string(),
	description: z.string(),
	schema: z.custom<SdlCommandSchema>(isZodObjectSchema).optional(),
	positionals: z.custom<SdlCommand["positionals"]>(isRecord).optional(),
	resultSchema: z.custom<SdlCommand["resultSchema"]>(isZodSchema).optional(),
	renderHuman: z
		.custom<SdlCommand["renderHuman"]>((value) => typeof value === "function")
		.optional(),
	renderMarkdown: z
		.custom<SdlCommand["renderMarkdown"]>((value) => typeof value === "function")
		.optional(),
	completionProvider: z
		.custom<SdlCommand["completionProvider"]>((value) => typeof value === "function")
		.optional(),
	run: z.custom<SdlCommand["run"]>((value) => typeof value === "function"),
});

const sdlExtensionSchema = z.object({
	commands: z.array(sdlCommandSchema).optional().default([]),
});

const sdlResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), message: z.string() }),
	z.object({ ok: z.literal(false), exitCode: z.number(), message: z.string() }),
]);

export function commandSegments(path: SdlCommandPath): readonly string[] {
	if (path.segments !== undefined) return path.segments;
	return path.group === undefined ? [path.name] : [path.group, path.name];
}

export function commandKey(path: SdlCommandPath): string {
	return commandSegments(path).join("/");
}

export function commandLeafName(path: SdlCommandPath): string {
	return path.segments?.at(-1) ?? path.name;
}

export function commandDisplayName(path: SdlCommandPath): string {
	return commandSegments(path).join(" ");
}

export function commandPathMatches(left: SdlCommandPath, right: SdlCommandPath): boolean {
	return commandKey(left) === commandKey(right);
}

export function listBuiltInSdlCommandCandidates(): BuiltInSdlCommandCandidate[] {
	return Object.entries(builtInCommandDefinitions)
		.map(([name, definition]) => ({
			name,
			description: definition.summary,
			fullDescription: definition.description,
			source: { level: "built-in" as const, label: `built-in command ${name}` },
			command: definition.command,
		}))
		.sort((left, right) => commandKey(left).localeCompare(commandKey(right)));
}

export function listStaticSdlCommandInfos(): SdlCommandCliInfo[] {
	return listBuiltInSdlCommandCandidates().map(
		({ group, name, description, fullDescription, groupDescription }) => ({
			...(group === undefined ? {} : { group }),
			...(groupDescription === undefined ? {} : { groupDescription }),
			name,
			description,
			fullDescription,
		}),
	);
}

export function commandInfoForLoadedCommand(
	command: SdlCommand,
	sourceLevel: SdlCommandSourceLevel,
	path: SdlCommandPath,
): SdlCommandCliInfo {
	const definition = path.group === undefined ? builtInCommandDefinitions[command.name] : undefined;
	if (sourceLevel === "built-in" && definition !== undefined) {
		return {
			name: command.name,
			description: definition.summary,
			fullDescription: definition.description,
		};
	}
	const segments = commandSegments(path);
	return {
		...(path.group === undefined ? {} : { group: path.group }),
		...(path.segments === undefined ? {} : { segments }),
		...(path.groupDescription === undefined ? {} : { groupDescription: path.groupDescription }),
		name: command.name,
		description: command.summary,
		fullDescription: command.description,
	};
}

export function validateSdlExtensionContribution(
	contribution: unknown,
	expectedPath: SdlCommandPath | string,
	sourceLabel: string,
): { ok: true; command: SdlCommand } | { ok: false; message: string } {
	const expectedName =
		typeof expectedPath === "string" ? expectedPath : commandLeafName(expectedPath);
	const parsed = sdlExtensionSchema.safeParse(contribution);
	if (!parsed.success) {
		return {
			ok: false,
			message: `Invalid SDL extension contribution ${sourceLabel}: ${formatSdlExtensionIssue(parsed.error.issues[0])}`,
		};
	}

	const command = findCommandEntry(parsed.data, expectedName);
	if (command === undefined) {
		return {
			ok: false,
			message: `Invalid SDL extension contribution ${sourceLabel}: expected a command entry named "${expectedName}" in commands[].`,
		};
	}

	return { ok: true, command };
}

export async function executeSdlCommand(
	ctx: SdlExtensionApi,
	command: SdlCommand,
	request: unknown,
): Promise<SdlResult> {
	const parsedRequest = (command.schema ?? z.object({})).safeParse(request);
	if (!parsedRequest.success) {
		return failed(
			`Invalid request for command ${command.name}: ${parsedRequest.error.issues[0]?.message ?? "request did not match command schema"}`,
			2,
		);
	}

	try {
		const result = await command.run(ctx, parsedRequest.data);
		return validateSdlResult(result, command.name);
	} catch (error) {
		return failed(`Command ${command.name} failed.\n${formatUnknownError(error)}`, 2);
	}
}

export function validateSdlResult(result: unknown, commandName: string): SdlResult {
	const parsed = sdlResultSchema.safeParse(result);
	if (parsed.success) {
		return parsed.data;
	}

	if (hasInvalidFailureExitCode(parsed.error.issues)) {
		return failed(`Command ${commandName} returned an invalid failure result.`, 2);
	}
	return failed(`Command ${commandName} returned an invalid result.`, 2);
}

export function validateSdlClinkrExit(result: unknown, commandName: string): ClinkrExit<unknown> {
	if (isSdlClinkrExit(result)) return result;
	return {
		type: "failure",
		errorType: "invalid-extension-result",
		message: `Command ${commandName} returned an invalid rendered result.`,
	};
}

export function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function findCommandEntry(
	extension: { commands: readonly SdlCommand[] },
	expectedName: string,
): SdlCommand | undefined {
	return extension.commands.find((command) => command.name === expectedName);
}

function formatSdlExtensionIssue(issue: z.core.$ZodIssue | undefined): string {
	if (issue === undefined || issue.path.length === 0) {
		return "default export must be an extension object created with defineExtension().";
	}
	if (issue.path[0] !== "commands") {
		return "default export must be an extension object created with defineExtension().";
	}
	if (issue.path.length === 1) {
		return "SDL extension commands must be an array of command entries.";
	}
	return `Invalid SDL command entry in extension: ${formatSdlCommandEntryIssue(issue)}.`;
}

function formatSdlCommandEntryIssue(issue: z.core.$ZodIssue): string {
	const field = issue.path[2];
	if (field === "name") {
		return "command name must be a string";
	}
	if (field === "summary") {
		return "command summary must be a string";
	}
	if (field === "description") {
		return "command description must be a string";
	}
	if (field === "schema") {
		return "command schema must be a Zod object schema from sdl-sdk";
	}
	if (field === "completionProvider") {
		return "command completionProvider must be a function";
	}
	if (field === "run") {
		return "command run must be a function";
	}
	return "command entry must include name, summary, description, and run";
}

function isZodObjectSchema(value: unknown): value is SdlCommandSchema {
	if (value instanceof z.ZodObject) return true;
	if (!isRecord(value)) return false;
	const candidate = value as { safeParse?: unknown; _zod?: { def?: { type?: unknown } } };
	return typeof candidate.safeParse === "function" && candidate._zod?.def?.type === "object";
}

function isZodSchema(value: unknown): value is z.ZodType {
	if (value instanceof z.ZodType) return true;
	if (!isRecord(value)) return false;
	const candidate = value as { safeParse?: unknown; _zod?: { def?: unknown } };
	return typeof candidate.safeParse === "function" && candidate._zod?.def !== undefined;
}

function isSdlClinkrExit(value: unknown): value is ClinkrExit<unknown> {
	if (!isRecord(value)) return false;
	if (value.type === "ok") return "data" in value;
	if (value.type === "negative") return typeof value.message === "string";
	if (value.type === "failure") {
		return typeof value.errorType === "string" && typeof value.message === "string";
	}
	if (value.type === "usageError") {
		return value.errorType === "usageError" && typeof value.message === "string";
	}
	return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasInvalidFailureExitCode(issues: readonly z.core.$ZodIssue[]): boolean {
	return issues.some((issue) => issue.path.length === 1 && issue.path[0] === "exitCode");
}
