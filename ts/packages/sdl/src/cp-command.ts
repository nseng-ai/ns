import { existsSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { defaultCpCommand } from "./default-commands/cp.ts";
import { loadSdkCommandModule } from "./sdk-module-loader.ts";
import { failed, type SdlCommand, type SdlContext, type SdlResult } from "./sdk.ts";

const cpCommandSchema = z.object({
	name: z.literal("cp"),
	description: z.string(),
	run: z.custom<SdlCommand["run"]>((value) => typeof value === "function"),
});

const sdlResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), message: z.string() }),
	z.object({ ok: z.literal(false), exitCode: z.number(), message: z.string() }),
]);

export async function loadCpCommand(cwd: string): Promise<{ ok: true; command: SdlCommand } | { ok: false; message: string }> {
	const commandPath = join(cwd, ".asdl", "commands", "cp.ts");
	if (!existsSync(commandPath)) {
		return { ok: true, command: defaultCpCommand };
	}

	try {
		const command = await loadSdkCommandModule(commandPath);
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

function validateCpCommand(command: unknown, commandPath: string): { ok: true; command: SdlCommand } | { ok: false; message: string } {
	const parsed = cpCommandSchema.safeParse(command);
	if (parsed.success) {
		return { ok: true, command: parsed.data };
	}

	return { ok: false, message: `Invalid ${commandPath}: ${formatCpCommandIssue(parsed.error.issues[0])}` };
}

function validateSdlResult(result: unknown, commandName: string): SdlResult {
	const parsed = sdlResultSchema.safeParse(result);
	if (parsed.success) {
		return parsed.data;
	}

	if (hasInvalidFailureExitCode(parsed.error.issues)) {
		return failed(`Command ${commandName} returned an invalid failure result.`, 2);
	}
	return failed(`Command ${commandName} returned an invalid result.`, 2);
}

function formatCpCommandIssue(issue: z.core.$ZodIssue | undefined): string {
	if (issue === undefined || issue.path.length === 0) {
		return "default export must be a command object created with defineCommand().";
	}
	const field = issue.path[0];
	if (field === "name") {
		return 'command name must be "cp".';
	}
	if (field === "description") {
		return "command description must be a string.";
	}
	if (field === "run") {
		return "command run must be a function.";
	}
	return "default export must be a command object created with defineCommand().";
}

function hasInvalidFailureExitCode(issues: readonly z.core.$ZodIssue[]): boolean {
	return issues.some((issue) => issue.path.length === 1 && issue.path[0] === "exitCode");
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
