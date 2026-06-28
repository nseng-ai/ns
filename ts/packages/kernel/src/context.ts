import process from "node:process";
import { createInterface } from "node:readline/promises";

import { runCommand } from "@sdl/core/exec";

import { PiTextGenerator } from "./sdk/pi-text-generation.ts";
import type { SdlConfirmPrompt, SdlExtensionApi } from "sdl-sdk";
import type { TextGenerator } from "@sdl/domain-primitives-transitional/text-generation";

export interface RealSdlCommandContextOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
}

export function createTextGenerator(): TextGenerator {
	return new PiTextGenerator();
}

export function createRealSdlCommandContext(
	options: RealSdlCommandContextOptions = {},
): SdlExtensionApi {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const textGenerator = createTextGenerator();
	const confirm = createTerminalConfirmPrompt();
	return {
		cwd,
		env,
		textGenerator,
		exec: async (command, args, execOptions = {}) => {
			const result = await runCommand(command, args, {
				cwd,
				env,
				...(execOptions.timeoutMs === undefined ? {} : { timeout: execOptions.timeoutMs }),
				...(execOptions.stdin === undefined ? {} : { stdin: execOptions.stdin }),
				...(execOptions.onStdout === undefined ? {} : { onStdout: execOptions.onStdout }),
				...(execOptions.onStderr === undefined ? {} : { onStderr: execOptions.onStderr }),
			});
			return {
				code: result.code,
				stdout: result.stdout,
				stderr: result.stderr,
				killed: result.killed,
			};
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

export type { SdlExtensionApi } from "sdl-sdk";
