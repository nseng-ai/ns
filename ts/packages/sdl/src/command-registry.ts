import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { defaultCpCommand } from "./default-commands/cp.ts";
import { loadSdkCommandModule } from "./sdk-module-loader.ts";
import { failed, type SdlCommand, type SdlContext, type SdlResult } from "./sdk.ts";
import { CHECKPOINT_MODEL_ENV, DEFAULT_CHECKPOINT_MODEL_REF, LEGACY_CHECKPOINT_MODEL_ENV } from "./text-generation.ts";

export interface SdlCommandInfo {
	name: string;
	description: string;
}

export interface SdlCommandCliInfo extends SdlCommandInfo {
	fullDescription: string;
}

export type ProjectCommandDiscoveryResult = { ok: true; names: readonly string[] } | { ok: false; message: string };

const PROJECT_COMMAND_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const PROJECT_COMMAND_NAME_RULE = "[a-z][a-z0-9-]*";

const builtInCommands = {
	cp: defaultCpCommand,
} as const satisfies Record<string, SdlCommand>;

const builtInCommandMeta = {
	cp: {
		summary: "Create a checkpoint commit for the current diff.",
		description: `Create a checkpoint commit for the current git diff using a model-authored message.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for the checkpoint message. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`,
	},
} as const satisfies Record<keyof typeof builtInCommands, { summary: string; description: string }>;

const sdlCommandSchema = z.object({
	name: z.string(),
	description: z.string(),
	run: z.custom<SdlCommand["run"]>((value) => typeof value === "function"),
});

const sdlResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), message: z.string() }),
	z.object({ ok: z.literal(false), exitCode: z.number(), message: z.string() }),
]);

export function discoverProjectCommandNames(cwd: string): ProjectCommandDiscoveryResult {
	const commandsDirectory = projectCommandsDirectory(cwd);
	if (!existsSync(commandsDirectory)) {
		return { ok: true, names: [] };
	}

	let directoryStat;
	try {
		directoryStat = statSync(commandsDirectory);
	} catch (error) {
		return { ok: false, message: `Could not inspect ${projectCommandsRelativePath()}.
${formatUnknownError(error)}` };
	}
	if (!directoryStat.isDirectory()) {
		return { ok: false, message: `${projectCommandsRelativePath()} must be a directory.` };
	}

	let entries;
	try {
		entries = readdirSync(commandsDirectory, { withFileTypes: true });
	} catch (error) {
		return { ok: false, message: `Could not read ${projectCommandsRelativePath()}.
${formatUnknownError(error)}` };
	}

	const commandNames = new Set<string>();
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".ts")) continue;
		if (entry.name.endsWith(".d.ts")) continue;

		const stem = entry.name.slice(0, -".ts".length);
		if (!PROJECT_COMMAND_NAME_PATTERN.test(stem)) {
			return {
				ok: false,
				message: `Invalid SDL command module filename: ${join(projectCommandsRelativePath(), entry.name)}. Command module filenames must match ${PROJECT_COMMAND_NAME_RULE}.`,
			};
		}
		commandNames.add(stem);
	}

	return { ok: true, names: [...commandNames].sort() };
}

export function listSdlCommandInfos(options: { projectCommandNames?: readonly string[] | undefined } = {}): SdlCommandCliInfo[] {
	const commandInfos = new Map<string, SdlCommandCliInfo>();
	for (const [commandName, meta] of Object.entries(builtInCommandMeta)) {
		commandInfos.set(commandName, {
			name: commandName,
			description: meta.summary,
			fullDescription: meta.description,
		});
	}
	for (const commandName of options.projectCommandNames ?? []) {
		const description = projectCommandDescription(commandName);
		commandInfos.set(commandName, { name: commandName, description, fullDescription: description });
	}
	return [...commandInfos.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function isBuiltInCommandName(commandName: string): commandName is keyof typeof builtInCommands {
	return Object.hasOwn(builtInCommands, commandName);
}

function projectCommandDescription(commandName: string): string {
	return `Run project-specific SDL command '${commandName}'.`;
}

export async function loadSdlCommand(commandName: string, cwd: string): Promise<{ ok: true; command: SdlCommand } | { ok: false; message: string }> {
	const commandPath = projectCommandPath(cwd, commandName);
	if (existsSync(commandPath)) {
		try {
			const command = await loadSdkCommandModule(commandPath);
			return validateSdlCommand(command, commandName, projectCommandRelativePath(commandName));
		} catch (error) {
			return { ok: false, message: `Failed to load ${projectCommandRelativePath(commandName)}.
${formatUnknownError(error)}` };
		}
	}

	if (isBuiltInCommandName(commandName)) {
		return { ok: true, command: builtInCommands[commandName] };
	}

	return { ok: false, message: `Unknown SDL command: ${commandName}` };
}

export async function runSdlCommand(ctx: SdlContext, commandName: string): Promise<SdlResult> {
	const loaded = await loadSdlCommand(commandName, ctx.cwd);
	if (!loaded.ok) {
		return failed(loaded.message, 2);
	}

	try {
		const result = await loaded.command.run(ctx, {});
		return validateSdlResult(result, loaded.command.name);
	} catch (error) {
		return failed(`Command ${commandName} failed.
${formatUnknownError(error)}`, 2);
	}
}

export function validateSdlCommand(
	command: unknown,
	expectedName: string,
	commandPath: string,
): { ok: true; command: SdlCommand } | { ok: false; message: string } {
	const nameIssue = validateCommandName(command, expectedName);
	if (nameIssue !== null) {
		return { ok: false, message: `Invalid ${commandPath}: ${nameIssue}` };
	}

	const parsed = sdlCommandSchema.safeParse(command);
	if (!parsed.success) {
		return { ok: false, message: `Invalid ${commandPath}: ${formatSdlCommandIssue(parsed.error.issues[0], expectedName)}` };
	}

	return { ok: true, command: parsed.data };
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

function commandModuleFilename(commandName: string): string {
	return `${commandName}.ts`;
}

function projectCommandsDirectory(cwd: string): string {
	return join(cwd, ".asdl", "commands");
}

function projectCommandsRelativePath(): string {
	return join(".asdl", "commands");
}

function projectCommandPath(cwd: string, commandName: string): string {
	return join(projectCommandsDirectory(cwd), commandModuleFilename(commandName));
}

function projectCommandRelativePath(commandName: string): string {
	return join(projectCommandsRelativePath(), commandModuleFilename(commandName));
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
	if (field === "run") {
		return "command run must be a function.";
	}
	return "default export must be a command object created with defineCommand().";
}

function commandNameMustBe(expectedName: string): string {
	return `command name must be "${expectedName}".`;
}

function hasInvalidFailureExitCode(issues: readonly z.core.$ZodIssue[]): boolean {
	return issues.some((issue) => issue.path.length === 1 && issue.path[0] === "exitCode");
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
