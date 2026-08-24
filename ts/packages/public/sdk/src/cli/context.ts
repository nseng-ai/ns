import process from "node:process";

import {
	createClinkrInteraction,
	resolveProcessCaps,
	type ClinkrInteraction,
} from "@nseng-ai/clinkr";
import { renderCapabilitiesForTerminal } from "@nseng-ai/clinkr/legacy";
import { readStdinLine } from "@nseng-ai/foundation/cli-runtime";
import { runCommand } from "@nseng-ai/foundation/exec";
import { optionalEntry, resolveHomeDir } from "@nseng-ai/foundation/primitives";

import { createCliCommandIo, noopNsProgress } from "../runtime/command-io.ts";
import type { NsConfirmPrompt, NsExtensionApi, TextGenerator } from "../sdk/index.ts";

export interface NsCliContext {
	context: NsExtensionApi;
	cwd: string;
	env: Record<string, string | undefined>;
	interaction: ClinkrInteraction;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export type NsCliBaseContext = Omit<NsExtensionApi, "hasExtension" | "projectConfig">;

export interface RealNsCommandContextOptions {
	textGenerator: TextGenerator;
	cwd?: string;
	env?: Record<string, string | undefined>;
	execEnv?: Record<string, string | undefined>;
	homeDir?: string;
}

export function createRealNsCommandContext(options: RealNsCommandContextOptions): NsCliBaseContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const execEnv = options.execEnv ?? env;
	const homeDir = resolveHomeDir(options.homeDir, env);
	const confirm = createTerminalConfirmPrompt();
	const select = createTerminalSelectPrompt({
		stdin: readStdinLine,
		stderr: (text) => process.stderr.write(text),
		isInteractive: () => process.stdin.isTTY === true && process.stderr.isTTY === true,
	});
	const stdout = (text: string) => process.stdout.write(text);
	const stderr = (text: string) => process.stderr.write(text);
	const commandIo = createCliCommandIo({ stdout, stderr });
	return {
		cwd,
		env,
		...optionalEntry("homeDir", homeDir),
		textGenerator: options.textGenerator,
		commandIo,
		progress: noopNsProgress,
		renderCapabilities: renderCapabilitiesForTerminal(resolveProcessCaps()),
		outputFormat: "human",
		stdout,
		stderr,
		isInteractive: () => process.stdin.isTTY === true && process.stderr.isTTY === true,
		exec: async (command, args, execOptions = {}) => {
			return await runCommand(command, args, {
				cwd: execOptions.cwd ?? cwd,
				env: execOptions.env ?? execEnv,
				...(execOptions.timeoutMs === undefined ? {} : { timeout: execOptions.timeoutMs }),
				...(execOptions.signal === undefined ? {} : { signal: execOptions.signal }),
				...(execOptions.stdin === undefined ? {} : { stdin: execOptions.stdin }),
				...(execOptions.onStdout === undefined ? {} : { onStdout: execOptions.onStdout }),
				...(execOptions.onStderr === undefined ? {} : { onStderr: execOptions.onStderr }),
			});
		},
		confirm,
		select,
	};
}

export function createNsCliInteraction(options: {
	stderr: (text: string) => void;
}): ClinkrInteraction {
	return createClinkrInteraction(createBaseCliInteractionOptions(options.stderr));
}

export function createTerminalConfirmPrompt(): NsConfirmPrompt {
	return async (title, message, options) => {
		if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) {
			throw new Error("Standalone confirmation UI is unavailable.");
		}
		const interaction = createClinkrInteraction({
			...createBaseCliInteractionOptions((text) => {
				process.stderr.write(text);
			}),
			isInteractive: () => process.stdin.isTTY === true && process.stderr.isTTY === true,
			formatPrompt: (_request, suffix) => `${title}\n\n${message}\n\nProceed? ${suffix} `,
		});
		return await interaction.confirm({
			message,
			defaultAnswer: options?.defaultAnswer ?? "no",
		});
	};
}

export function createTerminalSelectPrompt(options: {
	stdin: () => Promise<string | null>;
	stderr: (text: string) => void;
	isInteractive: () => boolean;
}): NsExtensionApi["select"] {
	return async (title, selectOptions) => {
		if (!options.isInteractive()) throw new Error("Standalone selection UI is unavailable.");
		if (selectOptions.length === 0) return { type: "cancelled" };
		const choices = selectOptions
			.map((option, index) => `${String(index + 1)}. ${option}`)
			.join("\n");
		const prompt = `${title}\n\n${choices}\n\nSelect an option [1-${String(selectOptions.length)}] (blank to cancel): `;
		for (;;) {
			options.stderr(prompt);
			const input = await options.stdin();
			if (input === null || input.trim() === "") return { type: "cancelled" };
			const value = input.trim();
			if (/^\d+$/.test(value)) {
				const selected = selectOptions[Number.parseInt(value, 10) - 1];
				if (selected !== undefined) return { type: "selected", value: selected };
			}
			options.stderr(
				`Error: enter a number from 1 to ${String(selectOptions.length)}, or press Enter to cancel.\n`,
			);
		}
	};
}

function createBaseCliInteractionOptions(stderr: (text: string) => void) {
	return {
		stdin: readStdinLine,
		stderr,
	};
}

export type { NsExtensionApi } from "../sdk/index.ts";
