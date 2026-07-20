import { formatErrorMessage, optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { isComposableCommand } from "../command/command.ts";
import { isNsClinkrCommandRun } from "../command/ns-clinkr-command.ts";
import { defineInternalParsedCommand, type RawArgvCommand } from "../sdk/command.ts";
import {
	failure,
	type CommandExit,
	type DescriptorCommand,
	type OptionSpec,
	type PositionalSpec,
	type RenderCapabilities,
} from "../sdk/index.ts";
import { validateLoadedCommandName, type ExtensionCommandEntry } from "../sdk/descriptor.ts";

import { extensionPointCommand, extensionPointsCommand } from "./built-in-extension-commands.ts";
import { NS_BUILT_IN_HELP_GROUP } from "./help-presentation.ts";
import { classifyZodIssuePath, type ZodIssuePathRule } from "./zod-issue-path.ts";

export type NsCommandSourceLevel = "built-in" | "preinstalled" | "project";

export interface NsCommandPath {
	group?: string;
	name: string;
	segments?: readonly string[];
	groupDescription?: string;
	hiddenAncestorKeys?: readonly string[];
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
	helpGroup?: string;
}

export interface NsCommandCandidate extends NsCommandCliInfo {
	source: NsCommandSourceInfo;
	entryPath?: string;
}

export interface BuiltInNsCommandCandidate extends NsCommandCandidate {
	source: NsCommandSourceInfo & { level: "built-in" };
	command: DescriptorCommand;
}

export interface BuiltInCommandDefinition extends Partial<NsCommandPath> {
	command: DescriptorCommand;
	helpGroup?: string;
}

export const builtInCommandDefinitions: Readonly<Record<string, BuiltInCommandDefinition>> = {
	"extension/point": {
		name: "point",
		segments: ["extension", "point"],
		groupDescription: "Inspect ns extension metadata.",
		helpGroup: NS_BUILT_IN_HELP_GROUP,
		command: extensionPointCommand,
	},
	"extension/points": {
		name: "points",
		segments: ["extension", "points"],
		groupDescription: "Inspect ns extension metadata.",
		helpGroup: NS_BUILT_IN_HELP_GROUP,
		command: extensionPointsCommand,
	},
};

const descriptorCommandSchema = z
	.object({
		name: z.string(),
		summary: z.string(),
		description: z.string(),
		run: z.custom<DescriptorCommand["run"]>((value) => typeof value === "function"),
		complete: z
			.custom<RawArgvCommand["complete"]>((value) => typeof value === "function")
			.optional(),
	})
	.passthrough();

interface ParsedDescriptorCommandContribution {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly schema: z.ZodObject;
	readonly resultSchema?: z.ZodType;
	readonly positionals?: Partial<Record<string, PositionalSpec>>;
	readonly options?: Partial<Record<string, OptionSpec>>;
	readonly renderHuman?: (data: unknown, caps: RenderCapabilities) => string;
	readonly renderMarkdown?: (data: unknown, caps: RenderCapabilities) => string;
	readonly completionProvider?: RawArgvCommand["complete"];
	run(
		ctx: Parameters<RawArgvCommand["run"]>[0],
		request: unknown,
	): ReturnType<RawArgvCommand["run"]>;
}

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
			name: definition.name ?? name,
			...optionalEntries({
				group: definition.group,
				segments: definition.segments,
				groupDescription: definition.groupDescription,
				helpGroup: definition.helpGroup,
			}),
			description: definition.command.summary,
			fullDescription: definition.command.description,
			source: { level: "built-in" as const, label: `built-in command ${name}` },
			command: definition.command,
		}))
		.sort((left, right) => commandKey(left).localeCompare(commandKey(right)));
}

export function listStaticNsCommandInfos(): NsCommandCliInfo[] {
	return listBuiltInNsCommandCandidates().map(toCommandCliInfo);
}

export function toCommandCliInfo(
	candidate: NsCommandPath &
		Pick<NsCommandCliInfo, "description" | "fullDescription" | "helpGroup">,
): NsCommandCliInfo {
	return {
		...optionalEntries({
			group: candidate.group,
			segments: candidate.segments,
			groupDescription: candidate.groupDescription,
			hiddenAncestorKeys: candidate.hiddenAncestorKeys,
			helpGroup: candidate.helpGroup,
		}),
		name: candidate.name,
		description: candidate.description,
		fullDescription: candidate.fullDescription,
	};
}

export function commandInfoForLoadedCommand(
	command: DescriptorCommand,
	sourceLevel: NsCommandSourceLevel,
	path: NsCommandPath & Pick<NsCommandCliInfo, "helpGroup">,
): NsCommandCliInfo {
	const definition = path.group === undefined ? builtInCommandDefinitions[command.name] : undefined;
	if (sourceLevel === "built-in" && definition !== undefined) {
		return {
			name: command.name,
			description: definition.command.summary,
			fullDescription: definition.command.description,
			...optionalEntries({ helpGroup: definition.helpGroup }),
		};
	}
	return toCommandCliInfo({
		...path,
		name: command.name,
		description: command.summary,
		fullDescription: command.description,
	});
}

export function validateDescriptorCommandContribution(
	contribution: unknown,
	entry: Pick<ExtensionCommandEntry, "name">,
	sourceLabel: string,
): { ok: true; command: DescriptorCommand } | { ok: false; message: string } {
	const parsed = descriptorCommandSchema.safeParse(contribution);
	if (!parsed.success) {
		return {
			ok: false,
			message: `Invalid ns descriptor command ${sourceLabel}: ${formatNsCommandIssue(parsed.error.issues[0])}`,
		};
	}
	const command = isComposableCommand(contribution) ? contribution : parsed.data;
	const nameValidation = validateLoadedCommandName(entry, command);
	if (!nameValidation.ok) {
		return {
			ok: false,
			message: `Invalid ns descriptor command ${sourceLabel}: ${nameValidation.message}`,
		};
	}
	if (isComposableCommand(command)) {
		if (!isNsClinkrCommandRun(command.run)) {
			return {
				ok: false,
				message: `Invalid ns descriptor command ${sourceLabel}: composable command run must carry nsClinkrCommand metadata.`,
			};
		}
		return { ok: true, command };
	}
	return adaptParsedDescriptorCommand(rawArgvCommand(command), sourceLabel);
}

export function extensionCommandFailedExit(
	commandName: string,
	error: unknown,
): CommandExit<never> {
	return failure(
		"extension-command-failed",
		`Command ${commandName} failed.\n${formatErrorMessage(error)}`,
		{ command: commandName },
	);
}

export function validateCommandExit(result: unknown, commandName: string): CommandExit {
	if (isCommandExit(result)) return result;
	return failure(
		"invalid-extension-result",
		`Command ${commandName} returned an invalid command exit.`,
		{ command: commandName },
	);
}

function rawArgvCommand(command: DescriptorCommand): RawArgvCommand {
	if (isComposableCommand(command)) throw new Error(`Command ${command.name} is composable.`);
	return command as RawArgvCommand;
}

function adaptParsedDescriptorCommand(
	command: RawArgvCommand,
	sourceLabel: string,
): { ok: true; command: DescriptorCommand } | { ok: false; message: string } {
	if (!isRecord(command) || !("schema" in command)) return { ok: true, command };
	const parsed = parseParsedDescriptorCommand(command);
	if (!parsed.ok) {
		return {
			ok: false,
			message: `Invalid ns descriptor command ${sourceLabel}: ${parsed.message}`,
		};
	}
	return {
		ok: true,
		command: defineInternalParsedCommand({
			name: parsed.command.name,
			summary: parsed.command.summary,
			description: parsed.command.description,
			schema: parsed.command.schema,
			...(parsed.command.resultSchema === undefined
				? {}
				: { resultSchema: parsed.command.resultSchema }),
			...(parsed.command.positionals === undefined
				? {}
				: { positionals: parsed.command.positionals }),
			...(parsed.command.options === undefined ? {} : { options: parsed.command.options }),
			...(parsed.command.renderHuman === undefined
				? {}
				: { renderHuman: parsed.command.renderHuman }),
			...(parsed.command.renderMarkdown === undefined
				? {}
				: { renderMarkdown: parsed.command.renderMarkdown }),
			...(parsed.command.completionProvider === undefined
				? {}
				: { completionProvider: parsed.command.completionProvider }),
			run: parsed.command.run,
		}),
	};
}

function parseParsedDescriptorCommand(
	command: RawArgvCommand,
): { ok: true; command: ParsedDescriptorCommandContribution } | { ok: false; message: string } {
	const bridgedSpec = isRecord(command["nsParsedCommandSpec"])
		? command["nsParsedCommandSpec"]
		: undefined;
	if (bridgedSpec !== undefined) {
		const parsed = parseParsedCommandSpec(command, bridgedSpec, isZodObjectLike);
		if (parsed.ok) return parsed;
	}
	const parsed = parseParsedCommandSpec(
		command,
		command,
		(value): value is z.ZodObject => value instanceof z.ZodObject,
	);
	if (parsed.ok) return parsed;
	return {
		ok: false,
		message: "command schema must be a Zod object schema from @nseng-ai/sdk.",
	};
}

interface ParsedCommandSpecFields {
	readonly schema?: unknown;
	readonly resultSchema?: unknown;
	readonly positionals?: unknown;
	readonly options?: unknown;
	readonly renderHuman?: unknown;
	readonly renderMarkdown?: unknown;
	readonly completionProvider?: unknown;
	readonly run?: unknown;
}

function parseParsedCommandSpec(
	command: RawArgvCommand,
	spec: ParsedCommandSpecFields,
	isSchema: (value: unknown) => value is z.ZodObject,
): { ok: true; command: ParsedDescriptorCommandContribution } | { ok: false } {
	if (!isSchema(spec.schema) || typeof spec.run !== "function") return { ok: false };
	return {
		ok: true,
		command: {
			name: command.name,
			summary: command.summary,
			description: command.description,
			schema: spec.schema,
			...(spec.resultSchema instanceof z.ZodType ? { resultSchema: spec.resultSchema } : {}),
			...(isPositionals(spec.positionals) ? { positionals: spec.positionals } : {}),
			...(isOptions(spec.options) ? { options: spec.options } : {}),
			...(isRenderFunction(spec.renderHuman) ? { renderHuman: spec.renderHuman } : {}),
			...(isRenderFunction(spec.renderMarkdown) ? { renderMarkdown: spec.renderMarkdown } : {}),
			...(isCompletionProvider(spec.completionProvider)
				? { completionProvider: spec.completionProvider }
				: {}),
			run: spec.run as ParsedDescriptorCommandContribution["run"],
		},
	};
}

function isZodObjectLike(value: unknown): value is z.ZodObject {
	return isRecord(value) && typeof value.safeParse === "function";
}

function isCompletionProvider(value: unknown): value is RawArgvCommand["complete"] {
	return typeof value === "function";
}

function isRenderFunction(
	value: unknown,
): value is (data: unknown, caps: RenderCapabilities) => string {
	return typeof value === "function";
}

function isPositionals(value: unknown): value is Partial<Record<string, PositionalSpec>> {
	if (!isRecord(value)) return false;
	return Object.values(value).every(
		(entry) => isRecord(entry) && typeof entry.position === "number",
	);
}

function isOptions(value: unknown): value is Partial<Record<string, OptionSpec>> {
	if (!isRecord(value)) return false;
	return Object.values(value).every(
		(entry) =>
			isRecord(entry) &&
			(!("short" in entry) || entry.short === undefined || typeof entry.short === "string"),
	);
}

const nsCommandEntryIssueFields = [
	{ field: "name", message: "command name must be a string" },
	{ field: "summary", message: "command summary must be a string" },
	{ field: "description", message: "command description must be a string" },
	{ field: "complete", message: "command complete must be a function" },
	{ field: "run", message: "command run must be a function" },
] as const satisfies readonly { field: string; message: string }[];

type NsCommandEntryIssueField = (typeof nsCommandEntryIssueFields)[number]["field"];

type NsCommandIssueKind = "invalid-command" | NsCommandEntryIssueField | "entry-other";

const nsCommandIssueRules: readonly ZodIssuePathRule<NsCommandIssueKind>[] =
	nsCommandEntryIssueFields.map(
		({ field }) =>
			({
				pattern: [field],
				match: "exact",
				value: field,
			}) satisfies ZodIssuePathRule<NsCommandIssueKind>,
	);

function formatNsCommandIssue(issue: z.core.$ZodIssue | undefined): string {
	const kind = classifyZodIssuePath(issue, nsCommandIssueRules, "invalid-command");
	if (kind === "invalid-command") {
		return "default export must be a command object.";
	}
	return `Invalid ns descriptor command: ${formatNsCommandEntryIssueKind(kind)}.`;
}

function formatNsCommandEntryIssueKind(
	kind: Exclude<NsCommandIssueKind, "invalid-command">,
): string {
	const entry = nsCommandEntryIssueFields.find((field) => field.field === kind);
	if (entry !== undefined) return entry.message;
	return "command entry must include name, summary, description, and run";
}

function isCommandExit(value: unknown): value is CommandExit {
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
