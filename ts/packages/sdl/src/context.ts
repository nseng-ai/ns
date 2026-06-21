import process from "node:process";
import { createInterface } from "node:readline/promises";

import { runCommand } from "@sdl/core/exec";

import { PiTextGenerator } from "./pi-text-generation.ts";
import { createSdlCommandResult, type SdlConfirmPrompt, type SdlContext } from "./sdk.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface RealSdlCommandContextOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
}

export function createTextGenerator(): TextGenerator {
	return new PiTextGenerator();
}

export function createRealSdlCommandContext(
	options: RealSdlCommandContextOptions = {},
): SdlContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const model = createTextGenerator();
	const confirm = createTerminalConfirmPrompt();
	return {
		cwd,
		env,
		model,
		exec: async (command, args, execOptions = {}) => {
			const result = await runCommand(command, args, {
				cwd,
				env,
				...(execOptions.timeoutMs === undefined ? {} : { timeout: execOptions.timeoutMs }),
				...(execOptions.stdin === undefined ? {} : { stdin: execOptions.stdin }),
				...(execOptions.onStdout === undefined ? {} : { onStdout: execOptions.onStdout }),
				...(execOptions.onStderr === undefined ? {} : { onStderr: execOptions.onStderr }),
			});
			return createSdlCommandResult({ command, args, cwd, result });
		},
		...(confirm === undefined ? {} : { confirm }),
	};
}

export function createTerminalConfirmPrompt(): SdlConfirmPrompt | undefined {
	if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) return undefined;
	return async (title, message) => {
		const readline = createInterface({ input: process.stdin, output: process.stdout });
		try {
			const answer = await readline.question(`${title}\n\n${message}\n\nProceed? [y/N] `);
			return parseTerminalConfirmAnswer(answer);
		} finally {
			readline.close();
		}
	};
}

export function parseTerminalConfirmAnswer(answer: string): boolean {
	const normalized = answer.trim().toLowerCase();
	return normalized === "y" || normalized === "yes";
}

export type { SdlContext } from "./sdk.ts";
