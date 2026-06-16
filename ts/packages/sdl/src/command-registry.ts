import { defaultChangesCommand } from "./default-commands/changes.ts";
import { defaultCpCommand } from "./default-commands/cp.ts";
import { defaultSubmitCommand } from "./default-commands/submit.ts";
import { failed, z, type SdlCommand, type SdlCommandSchema, type SdlContext, type SdlResult } from "./sdk.ts";
import {
	CHANGES_MODEL_ENV,
	CHECKPOINT_MODEL_ENV,
	DEFAULT_CHECKPOINT_MODEL_REF,
	DEFAULT_CHANGES_MODEL_REF,
	LEGACY_CHANGES_MODEL_ENV,
	LEGACY_CHECKPOINT_MODEL_ENV,
} from "./text-generation.ts";

export type SdlCommandSourceLevel = "built-in" | "global" | "project";

export interface SdlCommandSourceInfo {
	level: SdlCommandSourceLevel;
	label: string;
	path?: string | undefined;
}

export interface SdlCommandInfo {
	name: string;
	description: string;
}

export interface SdlCommandCliInfo extends SdlCommandInfo {
	fullDescription: string;
}

export interface SdlCommandCandidate extends SdlCommandCliInfo {
	source: SdlCommandSourceInfo;
	entryPath?: string | undefined;
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

export const builtInCommandDefinitions = {
	changes: {
		command: defaultChangesCommand,
		summary: "Summarize outstanding worktree changes without committing.",
		description: `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

Environment:
  ${CHANGES_MODEL_ENV}  Model reference for generated changes summaries. Defaults to ${DEFAULT_CHANGES_MODEL_REF}. Falls back to ${LEGACY_CHANGES_MODEL_ENV} when unset.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`,
	},
	cp: {
		command: defaultCpCommand,
		summary: "Create a checkpoint commit for the current diff.",
		description: `Create a checkpoint commit for the current git diff using a model-authored message.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for the checkpoint message. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`,
	},
	submit: {
		command: defaultSubmitCommand,
		summary: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
		description: defaultSubmitCommand.description,
	},
} as const satisfies Record<string, BuiltInCommandDefinition>;

const sdlCommandSchema = z.object({
	name: z.string(),
	description: z.string(),
	schema: z.custom<SdlCommandSchema>(isZodObjectSchema).optional(),
	positionals: z.custom<SdlCommand["positionals"]>(isRecord).optional(),
	run: z.custom<SdlCommand["run"]>((value) => typeof value === "function"),
});

const sdlExtensionSchema = z.object({
	commands: z.array(sdlCommandSchema).optional().default([]),
});

const sdlResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), message: z.string() }),
	z.object({ ok: z.literal(false), exitCode: z.number(), message: z.string() }),
]);

export function listBuiltInSdlCommandCandidates(): BuiltInSdlCommandCandidate[] {
	return Object.entries(builtInCommandDefinitions)
		.map(([name, definition]) => ({
			name,
			description: definition.summary,
			fullDescription: definition.description,
			source: { level: "built-in" as const, label: `built-in command ${name}` },
			command: definition.command,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
}

export function listStaticSdlCommandInfos(): SdlCommandCliInfo[] {
	return listBuiltInSdlCommandCandidates().map(({ name, description, fullDescription }) => ({ name, description, fullDescription }));
}

export function commandInfoForLoadedCommand(command: SdlCommand, sourceLevel: SdlCommandSourceLevel): SdlCommandCliInfo {
	if (sourceLevel === "built-in" && Object.hasOwn(builtInCommandDefinitions, command.name)) {
		const definition = builtInCommandDefinitions[command.name as keyof typeof builtInCommandDefinitions];
		return { name: command.name, description: definition.summary, fullDescription: definition.description };
	}
	return { name: command.name, description: command.description, fullDescription: command.description };
}

export function validateSdlExtensionContribution(
	contribution: unknown,
	expectedCommandName: string,
	sourceLabel: string,
): { ok: true; command: SdlCommand } | { ok: false; message: string } {
	const parsed = sdlExtensionSchema.safeParse(contribution);
	if (!parsed.success) {
		return { ok: false, message: `Invalid SDL extension contribution ${sourceLabel}: ${formatSdlExtensionIssue(parsed.error.issues[0])}` };
	}

	const command = findCommandEntry(parsed.data, expectedCommandName);
	if (command === undefined) {
		return {
			ok: false,
			message: `Invalid SDL extension contribution ${sourceLabel}: expected a command entry named "${expectedCommandName}" in commands[].`,
		};
	}

	return { ok: true, command };
}

export async function executeSdlCommand(ctx: SdlContext, command: SdlCommand, request: unknown): Promise<SdlResult> {
	const parsedRequest = (command.schema ?? z.object({})).safeParse(request);
	if (!parsedRequest.success) {
		return failed(`Invalid request for command ${command.name}: ${parsedRequest.error.issues[0]?.message ?? "request did not match command schema"}`, 2);
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

export function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function findCommandEntry(extension: { commands: readonly SdlCommand[] }, expectedName: string): SdlCommand | undefined {
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
	if (field === "description") {
		return "command description must be a string";
	}
	if (field === "schema") {
		return "command schema must be a Zod object schema from @asdl/sdl/sdk";
	}
	if (field === "run") {
		return "command run must be a function";
	}
	return "command entry must include name, description, and run";
}

function isZodObjectSchema(value: unknown): value is SdlCommandSchema {
	if (value instanceof z.ZodObject) return true;
	if (!isRecord(value)) return false;
	const candidate = value as { safeParse?: unknown; _zod?: { def?: { type?: unknown } } };
	return typeof candidate.safeParse === "function" && candidate._zod?.def?.type === "object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasInvalidFailureExitCode(issues: readonly z.core.$ZodIssue[]): boolean {
	return issues.some((issue) => issue.path.length === 1 && issue.path[0] === "exitCode");
}
