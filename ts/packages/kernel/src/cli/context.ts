import process from "node:process";

import {
	createClinkrInteraction,
	renderCapabilitiesForTerminal,
	resolveProcessCaps,
	type ClinkrInteraction,
} from "@nseng-ai/clinkr";
import { readStdinLine } from "@nseng-ai/foundation/cli-runtime";
import { runCommand } from "@nseng-ai/foundation/exec";

import { createCliCommandIo, noopNsProgress } from "../runtime/command-io.ts";
import { PiTextGenerator } from "../runtime/pi-text-generation.ts";
import type { NsConfirmPrompt, NsExtensionApi } from "../sdk/index.ts";
import type { TextGenerator } from "../sdk/index.ts";

export interface NsCliContext {
	context: NsExtensionApi;
	cwd: string;
	env: Record<string, string | undefined>;
	interaction: ClinkrInteraction;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export interface RealNsCommandContextOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
}

export function createTextGenerator(): TextGenerator {
	return new PiTextGenerator();
}

export function createRealNsCommandContext(
	options: RealNsCommandContextOptions = {},
): NsExtensionApi {
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
		progress: noopNsProgress,
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

export function createNsCliInteraction(options: {
	stderr: (text: string) => void;
}): ClinkrInteraction {
	return createClinkrInteraction(createBaseCliInteractionOptions(options.stderr));
}

export function createTerminalConfirmPrompt(): NsConfirmPrompt | undefined {
	if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) return undefined;
	return async (title, message, options) => {
		const interaction = createClinkrInteraction({
			...createBaseCliInteractionOptions((text) => {
				process.stderr.write(text);
			}),
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

function createBaseCliInteractionOptions(stderr: (text: string) => void) {
	return {
		stdin: readStdinLine,
		stderr,
	};
}

export type { NsExtensionApi } from "../sdk/index.ts";
