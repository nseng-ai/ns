import process from "node:process";
import { createInterface } from "node:readline/promises";

import { renderCapabilitiesForTerminal, resolveProcessCaps } from "@sdl/clinkr";
import { runCommand } from "@sdl/exec";

import { createCliCommandIo, noopSdlProgress } from "./sdk/command-io.ts";
import { PiTextGenerator } from "./sdk/pi-text-generation.ts";
import type { SdlConfirmOptions, SdlConfirmPrompt, SdlExtensionApi } from "sdl-sdk";
import type { TextGenerator } from "sdl-sdk";

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
	const stdout = (text: string) => process.stdout.write(text);
	const stderr = (text: string) => process.stderr.write(text);
	const commandIo = createCliCommandIo({ stdout, stderr });
	return {
		cwd,
		env,
		textGenerator,
		commandIo,
		progress: noopSdlProgress,
		renderCapabilities: renderCapabilitiesForTerminal(resolveProcessCaps()),
		stdout,
		stderr,
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
	return async (title, message, options) => {
		const defaultAnswer = options?.defaultAnswer ?? "no";
		const suffix = defaultAnswer === "yes" ? "[Y/n]" : "[y/N]";
		const readline = createInterface({ input: process.stdin, output: process.stdout });
		try {
			const answer = await readline.question(`${title}\n\n${message}\n\nProceed? ${suffix} `);
			return parseTerminalConfirmAnswer(answer, { defaultAnswer });
		} finally {
			readline.close();
		}
	};
}

export function parseTerminalConfirmAnswer(
	answer: string,
	options: SdlConfirmOptions = {},
): boolean {
	const normalized = answer.trim().toLowerCase();
	if (normalized === "y" || normalized === "yes") return true;
	if (normalized === "n" || normalized === "no") return false;
	if (normalized === "") return options.defaultAnswer === "yes";
	return false;
}

export type { SdlExtensionApi } from "sdl-sdk";
