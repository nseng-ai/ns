import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createJiti } from "jiti/static";

import { defaultCpCommand } from "./default-commands/cp.ts";
import * as sdlSdk from "./sdk.ts";
import { failed, type SdlCommand, type SdlContext, type SdlResult } from "./sdk.ts";

const SDL_SRC_DIR = dirname(fileURLToPath(import.meta.url));

export async function loadCpCommand(cwd: string): Promise<{ ok: true; command: SdlCommand } | { ok: false; message: string }> {
	const commandPath = join(cwd, ".asdl", "commands", "cp.ts");
	if (!existsSync(commandPath)) {
		return { ok: true, command: defaultCpCommand };
	}

	try {
		const command = await loadCommandModule(commandPath);
		return validateCpCommand(command, commandPath);
	} catch (error) {
		return { ok: false, message: `Failed to load .asdl/commands/cp.ts.\n${formatUnknownError(error)}` };
	}
}

export async function runCp(ctx: SdlContext): Promise<SdlResult> {
	const loaded = await loadCpCommand(ctx.cwd);
	if (!loaded.ok) {
		return failed(loaded.message, 2);
	}

	try {
		const result = await loaded.command.run(ctx);
		return validateSdlResult(result, loaded.command.name);
	} catch (error) {
		return failed(`Command cp failed.\n${formatUnknownError(error)}`, 2);
	}
}

async function loadCommandModule(commandPath: string): Promise<unknown> {
	const jiti = createJiti(import.meta.url, {
		alias: {
			"@asdl/sdl/sdk": join(SDL_SRC_DIR, "sdk.ts"),
		},
		moduleCache: false,
		virtualModules: {
			"@asdl/sdl/sdk": sdlSdk,
		},
	});
	return jiti.import(commandPath, { default: true });
}

function validateCpCommand(command: unknown, commandPath: string): { ok: true; command: SdlCommand } | { ok: false; message: string } {
	if (!isRecord(command)) {
		return { ok: false, message: `Invalid ${commandPath}: default export must be a command object created with defineCommand().` };
	}
	if (command.name !== "cp") {
		return { ok: false, message: `Invalid ${commandPath}: command name must be "cp".` };
	}
	if (typeof command.description !== "string") {
		return { ok: false, message: `Invalid ${commandPath}: command description must be a string.` };
	}
	if (typeof command.run !== "function") {
		return { ok: false, message: `Invalid ${commandPath}: command run must be a function.` };
	}

	return { ok: true, command: command as unknown as SdlCommand };
}

function validateSdlResult(result: unknown, commandName: string): SdlResult {
	if (!isRecord(result) || typeof result.ok !== "boolean" || typeof result.message !== "string") {
		return failed(`Command ${commandName} returned an invalid result.`, 2);
	}
	if (result.ok) {
		return { ok: true, message: result.message };
	}
	if (typeof result.exitCode !== "number") {
		return failed(`Command ${commandName} returned an invalid failure result.`, 2);
	}
	return { ok: false, exitCode: result.exitCode, message: result.message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
