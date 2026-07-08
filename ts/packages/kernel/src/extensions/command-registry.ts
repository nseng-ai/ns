import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import {
	defineParsedCommand,
	failure,
	type CommandExit,
	type DescriptorCommand,
	type OptionSpec,
	type PositionalSpec,
	type RenderCapabilities,
} from "../sdk/index.ts";
import { validateLoadedCommandName, type ExtensionCommandEntry } from "../sdk/descriptor.ts";

import {
	extensionPointCommand,
	extensionPointsCommand,
	installCommand,
} from "./built-in-extension-commands.ts";
import { classifyZodIssuePath, type ZodIssuePathRule } from "./zod-issue-path.ts";

export type NsCommandSourceLevel = "built-in" | "preinstalled" | "project";

export interface NsCommandPath {
	group?: string;
	name: string;
	segments?: readonly string[];
	groupDescription?: string;
	hiddenSegments?: readonly string[];
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
	install: {
		name: "install",
		helpGroup: "Built-ins:",
		command: installCommand,
	},
	"extension/point": {
		name: "point",
		segments: ["extension", "point"],
		groupDescription: "Inspect ns extension metadata.",
		command: extensionPointCommand,
	},
	"extension/points": {
		name: "points",
		segments: ["extension", "points"],
		groupDescription: "Inspect ns extension metadata.",
		command: extensionPointsCommand,
	},
};

const NS_EXEC_COMMAND_PREFIX = "exec-";

const descriptorCommandSchema = z
	.object({
		name: z.string(),
		summary: z.string(),
		description: z.string(),
		run: z.custom<DescriptorCommand["run"]>((value) => typeof value === "function"),
		complete: z
			.custom<DescriptorCommand["complete"]>((value) => typeof value === "function")
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
	readonly completionProvider?: DescriptorCommand["complete"];
	run(
		ctx: Parameters<DescriptorCommand["run"]>[0],
		request: unknown,
	): ReturnType<DescriptorCommand["run"]>;
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
			hiddenSegments: candidate.hiddenSegments,
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
	path: NsCommandPath,
): NsCommandCliInfo {
	const definition = path.group === undefined ? builtInCommandDefinitions[command.name] : undefined;
	if (sourceLevel === "built-in" && definition !== undefined) {
		return {
			name: command.name,
			description: definition.command.summary,
			fullDescription: definition.command.description,
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
	const nameValidation = validateLoadedCommandName(entry, parsed.data);
	if (!nameValidation.ok && parsed.data.name !== `${NS_EXEC_COMMAND_PREFIX}${entry.name}`) {
		return {
			ok: false,
			message: `Invalid ns descriptor command ${sourceLabel}: ${nameValidation.message}`,
		};
	}
	return adaptParsedDescriptorCommand(contribution as DescriptorCommand, sourceLabel);
}

export function extensionCommandFailedExit(
	commandName: string,
	error: unknown,
): CommandExit<never> {
	return failure(
		"extension-command-failed",
		`Command ${commandName} failed.\n${formatUnknownError(error)}`,
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

export function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function adaptParsedDescriptorCommand(
	command: DescriptorCommand,
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
		command: defineParsedCommand({
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
	command: DescriptorCommand,
): { ok: true; command: ParsedDescriptorCommandContribution } | { ok: false; message: string } {
	if (!isRecord(command)) return { ok: false, message: "command must be an object." };
	const bridgedSpec = parseBridgedParsedCommandSpec(command);
	if (bridgedSpec.ok) return bridgedSpec;
	if (!(command.schema instanceof z.ZodObject)) {
		return {
			ok: false,
			message: "command schema must be a Zod object schema from @nseng-ai/kernel/sdk.",
		};
	}
	return {
		ok: true,
		command: {
			name: command.name,
			summary: command.summary,
			description: command.description,
			schema: command.schema,
			...(command.resultSchema instanceof z.ZodType ? { resultSchema: command.resultSchema } : {}),
			...(isPositionals(command.positionals) ? { positionals: command.positionals } : {}),
			...(isOptions(command.options) ? { options: command.options } : {}),
			...(isRenderFunction(command.renderHuman) ? { renderHuman: command.renderHuman } : {}),
			...(isRenderFunction(command.renderMarkdown)
				? { renderMarkdown: command.renderMarkdown }
				: {}),
			...(isCompletionProvider(command.completionProvider)
				? { completionProvider: command.completionProvider }
				: {}),
			run: command.run as ParsedDescriptorCommandContribution["run"],
		},
	};
}

function parseBridgedParsedCommandSpec(
	command: DescriptorCommand,
): { ok: true; command: ParsedDescriptorCommandContribution } | { ok: false } {
	if (!isRecord(command)) return { ok: false };
	const spec = command["nsParsedCommandSpec"];
	if (!isRecord(spec)) return { ok: false };
	if (!isZodObjectLike(spec.schema) || typeof spec.run !== "function") {
		return { ok: false };
	}
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

function isCompletionProvider(value: unknown): value is DescriptorCommand["complete"] {
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
