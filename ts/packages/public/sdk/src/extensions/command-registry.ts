import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { DescriptorCommand } from "../sdk/index.ts";
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

export interface FilesystemNsCommandCandidate extends NsCommandCandidate {
	readonly commandDirectory: string;
	readonly filesystemPath: readonly string[];
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
	})
	.passthrough()
	.refine(
		(command) => typeof command["run"] === "function" || typeof command["handler"] === "function",
		{ message: "command must define run or handler" },
	);

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
	const command = parsed.data;
	const nameValidation = validateLoadedCommandName(entry, command);
	if (!nameValidation.ok) {
		return {
			ok: false,
			message: `Invalid ns descriptor command ${sourceLabel}: ${nameValidation.message}`,
		};
	}
	return { ok: true, command };
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
