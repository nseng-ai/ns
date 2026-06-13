import type { TextGenerationGateway } from "./text-generation.ts";

export type { TextGenerationGateway, TextGenerationRequest, TextGenerationResult } from "./text-generation.ts";

export interface ExecOptions {
	timeoutMs?: number;
}

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
	killed: boolean;
}

export interface SdlContext {
	/** Current repository working directory for command-module execution. */
	cwd: string;
	/** Environment visible to command modules and shell execution. */
	env: Record<string, string | undefined>;
	/** Low-level argv execution hook. Project commands own the exact commands they run. */
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	/** Raw text-generation capability; command modules own prompts, validation, and repair policy. */
	model: TextGenerationGateway;
}

export type SdlResult = { ok: true; message: string } | { ok: false; exitCode: number; message: string };

export interface SdlCommand {
	name: string;
	description: string;
	run(ctx: SdlContext): Promise<SdlResult> | SdlResult;
}

export function defineCommand(command: SdlCommand): SdlCommand {
	return command;
}

export function ok(message: string): SdlResult {
	return { ok: true, message };
}

export function failed(message: string, exitCode = 1): SdlResult {
	return { ok: false, exitCode, message };
}
