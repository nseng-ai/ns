import process from "node:process";

import {
	createClinkrInteraction,
	renderCapabilitiesForTerminal,
	resolveProcessCaps,
} from "@ns/clinkr";
import { readStdinLine } from "@ns/core/cli-runtime";
import { runCommand } from "@ns/core/exec";
import type { SlotCliContext } from "@ns/slot/api";

import { createCliCommandIo, noopSdlProgress } from "../runtime/command-io.ts";
import { PiTextGenerator } from "../runtime/pi-text-generation.ts";
import type { SdlConfirmPrompt, SdlExtensionApi } from "../sdk/index.ts";
import type { TextGenerator } from "../sdk/index.ts";

export interface SdlCliContext extends SlotCliContext {
	context: SdlExtensionApi;
	stdout: (text: string) => void;
}

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
		outputFormat: "human",
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
	if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) return undefined;
	return async (title, message, options) => {
		const interaction = createClinkrInteraction({
			stdin: readStdinLine,
			stderr: (text) => {
				process.stderr.write(text);
			},
			isInteractive: () => process.stdin.isTTY === true && process.stderr.isTTY === true,
			formatPrompt: (_request, suffix) => `${title}\n\n${message}\n\nProceed? ${suffix} `,
		});
		const result = await interaction.confirm({
			message,
			defaultAnswer: options?.defaultAnswer ?? "no",
		});
		return result.type === "confirmed";
	};
}

export type { SdlExtensionApi } from "../sdk/index.ts";
