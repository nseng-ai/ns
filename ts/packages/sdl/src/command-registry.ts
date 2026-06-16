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

export interface SdlCommandInfo {
	name: string;
	description: string;
}

export interface SdlCommandCliInfo extends SdlCommandInfo {
	fullDescription: string;
}

export interface BuiltInCommandDefinition {
	command: SdlCommand;
	summary: string;
	description: string;
}

export const SDL_COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
export const SDL_COMMAND_NAME_RULE = "[a-z][a-z0-9-]*";

const builtInCommandInfoDefinitions = {
	changes: {
		summary: "Summarize outstanding worktree changes without committing.",
		description: `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

Environment:
  ${CHANGES_MODEL_ENV}  Model reference for generated changes summaries. Defaults to ${DEFAULT_CHANGES_MODEL_REF}. Falls back to ${LEGACY_CHANGES_MODEL_ENV} when unset.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`,
	},
	cp: {
		summary: "Create a checkpoint commit for the current diff.",
		description: `Create a checkpoint commit for the current git diff using a model-authored message.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for the checkpoint message. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`,
	},
	submit: {
		summary: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
		description: defaultSubmitCommand.description,
	},
} as const satisfies Record<string, { summary: string; description: string }>;

export const builtInCommandDefinitions = {
	cp: {
		command: defaultCpCommand,
		summary: builtInCommandInfoDefinitions.cp.summary,
		description: builtInCommandInfoDefinitions.cp.description,
	},
	submit: {
		command: defaultSubmitCommand,
		summary: builtInCommandInfoDefinitions.submit.summary,
		description: builtInCommandInfoDefinitions.submit.description,
	},
} as const satisfies Record<string, BuiltInCommandDefinition>;

const sdlCommandSchema = z.object({
	name: z.string(),
	description: z.string(),
	schema: z.custom<SdlCommandSchema>(isZodObjectSchema).optional(),
	positionals: z.custom<SdlCommand["positionals"]>(isRecord).optional(),
	run: z.custom<SdlCommand["run"]>((value) => typeof value === "function"),
});

const sdlResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), message: z.string() }),
	z.object({ ok: z.literal(false), exitCode: z.number(), message: z.string() }),
]);

export function listStaticSdlCommandInfos(): SdlCommandCliInfo[] {
	return Object.entries(builtInCommandInfoDefinitions)
		.map(([name, definition]) => ({ name, description: definition.summary, fullDescription: definition.description }))
		.sort((left, right) => left.name.localeCompare(right.name));
}

export function commandInfoForLoadedCommand(command: SdlCommand, sourceLevel: "built-in" | "global" | "project"): SdlCommandCliInfo {
	if (sourceLevel === "built-in" && Object.hasOwn(builtInCommandInfoDefinitions, command.name)) {
		const definition = builtInCommandInfoDefinitions[command.name as keyof typeof builtInCommandInfoDefinitions];
		return { name: command.name, description: definition.summary, fullDescription: definition.description };
	}
	return { name: command.name, description: command.description, fullDescription: command.description };
}

export function validateSdlCommand(
	command: unknown,
	expectedName: string,
	sourceLabel: string,
): { ok: true; command: SdlCommand } | { ok: false; message: string } {
	const nameIssue = validateCommandName(command, expectedName);
	if (nameIssue !== null) {
		return { ok: false, message: `Invalid ${sourceLabel}: ${nameIssue}` };
	}

	const parsed = sdlCommandSchema.safeParse(command);
	if (!parsed.success) {
		return { ok: false, message: `Invalid ${sourceLabel}: ${formatSdlCommandIssue(parsed.error.issues[0], expectedName)}` };
	}

	return { ok: true, command: parsed.data };
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

function validateCommandName(command: unknown, expectedName: string): string | null {
	if (typeof command !== "object" || command === null || Array.isArray(command)) {
		return null;
	}
	const candidate = command as { readonly name?: unknown };
	if (candidate.name !== expectedName) {
		return commandNameMustBe(expectedName);
	}
	return null;
}

function formatSdlCommandIssue(issue: z.core.$ZodIssue | undefined, expectedName: string): string {
	if (issue === undefined || issue.path.length === 0) {
		return "default export must be a command object created with defineCommand().";
	}
	const field = issue.path[0];
	if (field === "name") {
		return commandNameMustBe(expectedName);
	}
	if (field === "description") {
		return "command description must be a string.";
	}
	if (field === "schema") {
		return "command schema must be a Zod object schema from @asdl/sdl/sdk.";
	}
	if (field === "run") {
		return "command run must be a function.";
	}
	return "default export must be a command object created with defineCommand().";
}

function commandNameMustBe(expectedName: string): string {
	return `command name must be "${expectedName}".`;
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
