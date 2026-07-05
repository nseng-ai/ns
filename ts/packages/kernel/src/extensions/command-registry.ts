import { z } from "zod";

import {
	failed,
	type ClinkrExit,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
	type NsResult,
} from "../sdk/index.ts";

import { classifyZodIssuePath, type ZodIssuePathRule } from "./zod-issue-path.ts";

export type NsCommandSourceLevel = "built-in" | "first-party" | "global" | "project";

export interface NsCommandPath {
	group?: string;
	name: string;
	segments?: readonly string[];
	groupDescription?: string;
}

export interface NsCommandSourceInfo {
	level: NsCommandSourceLevel;
	label: string;
	path?: string;
}

export interface NsCommandInfo extends NsCommandPath {
	description: string;
}

export interface NsCommandCliInfo extends NsCommandInfo {
	fullDescription: string;
	groupDescription?: string;
}

export interface NsCommandCandidate extends NsCommandCliInfo {
	source: NsCommandSourceInfo;
	entryPath?: string;
}

export interface BuiltInNsCommandCandidate extends NsCommandCandidate {
	source: NsCommandSourceInfo & { level: "built-in" };
	command: NsCommand;
}

export interface BuiltInCommandDefinition {
	command: NsCommand;
	summary: string;
	description: string;
}

export const NS_COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const NS_COMMAND_NAME_RULE = "[a-z][a-z0-9-]*";

export const builtInCommandDefinitions: Readonly<Record<string, BuiltInCommandDefinition>> = {};

const nsCommandSchema = z.object({
	name: z.string(),
	summary: z.string(),
	description: z.string(),
	schema: z.custom<NsCommandSchema>(isZodObjectSchema).optional(),
	positionals: z.custom<NsCommand["positionals"]>(isRecord).optional(),
	options: z.custom<NsCommand["options"]>(isRecord).optional(),
	resultSchema: z.custom<NsCommand["resultSchema"]>(isZodSchema).optional(),
	renderHuman: z
		.custom<NsCommand["renderHuman"]>((value) => typeof value === "function")
		.optional(),
	renderMarkdown: z
		.custom<NsCommand["renderMarkdown"]>((value) => typeof value === "function")
		.optional(),
	completionProvider: z
		.custom<NsCommand["completionProvider"]>((value) => typeof value === "function")
		.optional(),
	run: z.custom<NsCommand["run"]>((value) => typeof value === "function"),
});

const nsExtensionSchema = z.object({
	commands: z.array(nsCommandSchema).optional().default([]),
});

const nsResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), message: z.string() }),
	z.object({ ok: z.literal(false), exitCode: z.number(), message: z.string() }),
]);

export function commandSegments(path: NsCommandPath): readonly string[] {
	if (path.segments !== undefined) return path.segments;
	return path.group === undefined ? [path.name] : [path.group, path.name];
}

export function commandKey(path: NsCommandPath): string {
	return commandSegments(path).join("/");
}

export function commandLeafName(path: NsCommandPath): string {
	return path.segments?.at(-1) ?? path.name;
}

export function commandDisplayName(path: NsCommandPath): string {
	return commandSegments(path).join(" ");
}

export function commandPathMatches(left: NsCommandPath, right: NsCommandPath): boolean {
	return commandKey(left) === commandKey(right);
}

export function listBuiltInNsCommandCandidates(): BuiltInNsCommandCandidate[] {
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

export function listStaticNsCommandInfos(): NsCommandCliInfo[] {
	return listBuiltInNsCommandCandidates().map(toCommandCliInfo);
}

export function toCommandCliInfo(
	candidate: NsCommandPath & Pick<NsCommandCliInfo, "description" | "fullDescription">,
): NsCommandCliInfo {
	return {
		...(candidate.group === undefined ? {} : { group: candidate.group }),
		...(candidate.segments === undefined ? {} : { segments: candidate.segments }),
		...(candidate.groupDescription === undefined
			? {}
			: { groupDescription: candidate.groupDescription }),
		name: candidate.name,
		description: candidate.description,
		fullDescription: candidate.fullDescription,
	};
}

export function commandInfoForLoadedCommand(
	command: NsCommand,
	sourceLevel: NsCommandSourceLevel,
	path: NsCommandPath,
): NsCommandCliInfo {
	const definition = path.group === undefined ? builtInCommandDefinitions[command.name] : undefined;
	if (sourceLevel === "built-in" && definition !== undefined) {
		return {
			name: command.name,
			description: definition.summary,
			fullDescription: definition.description,
		};
	}
	return toCommandCliInfo({
		...path,
		name: command.name,
		description: command.summary,
		fullDescription: command.description,
	});
}

export function validateNsExtensionContribution(
	contribution: unknown,
	expectedPath: NsCommandPath | string,
	sourceLabel: string,
): { ok: true; command: NsCommand } | { ok: false; message: string } {
	const expectedName =
		typeof expectedPath === "string" ? expectedPath : commandLeafName(expectedPath);
	const parsed = nsExtensionSchema.safeParse(contribution);
	if (!parsed.success) {
		return {
			ok: false,
			message: `Invalid ns extension contribution ${sourceLabel}: ${formatNsExtensionIssue(parsed.error.issues[0])}`,
		};
	}

	const command = findCommandEntry(parsed.data, expectedName);
	if (command === undefined) {
		return {
			ok: false,
			message: `Invalid ns extension contribution ${sourceLabel}: expected a command entry named "${expectedName}" in commands[].`,
		};
	}

	return { ok: true, command };
}

export async function executeNsCommand(
	ctx: NsExtensionApi,
	command: NsCommand,
	request: unknown,
): Promise<NsResult> {
	const parsedRequest = (command.schema ?? z.object({})).safeParse(request);
	if (!parsedRequest.success) {
		return failed(
			`Invalid request for command ${command.name}: ${parsedRequest.error.issues[0]?.message ?? "request did not match command schema"}`,
			2,
		);
	}

	try {
		const result = await command.run(ctx, parsedRequest.data);
		return validateNsResult(result, command.name);
	} catch (error) {
		return failed(`Command ${command.name} failed.\n${formatUnknownError(error)}`, 2);
	}
}

export function validateNsResult(result: unknown, commandName: string): NsResult {
	const parsed = nsResultSchema.safeParse(result);
	if (parsed.success) {
		return parsed.data;
	}

	if (hasInvalidFailureExitCode(parsed.error.issues)) {
		return failed(`Command ${commandName} returned an invalid failure result.`, 2);
	}
	return failed(`Command ${commandName} returned an invalid result.`, 2);
}

export function validateNsClinkrExit(result: unknown, commandName: string): ClinkrExit<unknown> {
	if (isNsClinkrExit(result)) return result;
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
	extension: { commands: readonly NsCommand[] },
	expectedName: string,
): NsCommand | undefined {
	return extension.commands.find((command) => command.name === expectedName);
}

const nsExtensionCommandEntryIssueFields = [
	{ field: "name", message: "command name must be a string" },
	{ field: "summary", message: "command summary must be a string" },
	{ field: "description", message: "command description must be a string" },
	{ field: "schema", message: "command schema must be a Zod object schema from @ns/kernel/sdk" },
	{ field: "options", message: "command options must be an object" },
	{ field: "completionProvider", message: "command completionProvider must be a function" },
	{ field: "run", message: "command run must be a function" },
] as const satisfies readonly { field: string; message: string }[];

type NsExtensionCommandEntryIssueField =
	(typeof nsExtensionCommandEntryIssueFields)[number]["field"];

type NsExtensionIssueKind =
	| "invalid-extension"
	| "commands-not-array"
	| NsExtensionCommandEntryIssueField
	| "entry-other";

const nsExtensionIssueRules: readonly ZodIssuePathRule<NsExtensionIssueKind>[] = [
	{ pattern: ["commands"], match: "exact", value: "commands-not-array" },
	...nsExtensionCommandEntryIssueFields.map(
		({ field }) =>
			({
				pattern: ["commands", { type: "number" }, field],
				match: "exact",
				value: field,
			}) satisfies ZodIssuePathRule<NsExtensionIssueKind>,
	),
	{ pattern: ["commands"], match: "prefix", value: "entry-other" },
];

function formatNsExtensionIssue(issue: z.core.$ZodIssue | undefined): string {
	const kind = classifyZodIssuePath(issue, nsExtensionIssueRules, "invalid-extension");
	if (kind === "invalid-extension") {
		return "default export must be an extension object created with defineExtension().";
	}
	if (kind === "commands-not-array") {
		return "ns extension commands must be an array of command entries.";
	}
	return `Invalid ns command entry in extension: ${formatNsCommandEntryIssueKind(kind)}.`;
}

function formatNsCommandEntryIssueKind(
	kind: Exclude<NsExtensionIssueKind, "invalid-extension" | "commands-not-array">,
): string {
	const entry = nsExtensionCommandEntryIssueFields.find((field) => field.field === kind);
	if (entry !== undefined) return entry.message;
	return "command entry must include name, summary, description, and run";
}

function isZodObjectSchema(value: unknown): value is NsCommandSchema {
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

function isNsClinkrExit(value: unknown): value is ClinkrExit<unknown> {
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
