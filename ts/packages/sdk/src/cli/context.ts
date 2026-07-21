import process from "node:process";

import {
	createClinkrInteraction,
	type ClinkrFormat,
	type ClinkrInteraction,
} from "@nseng-ai/clinkr";
import { readStdinLine } from "@nseng-ai/foundation/cli-runtime";
import { runCommand } from "@nseng-ai/foundation/exec";
import { optionalEntry, resolveHomeDir } from "@nseng-ai/foundation/primitives";

import { createCliCommandIo, noopNsProgress } from "../runtime/command-io.ts";
import type {
	NsConfirmPrompt,
	NsExtensionApi,
	NsOutputStream,
	NsProgressPhaseListener,
	RenderCapabilities,
	TextGenerator,
} from "../sdk/index.ts";

export interface NsCliContext {
	context: NsExtensionApi;
	cwd: string;
	env: Record<string, string | undefined>;
	interaction: ClinkrInteraction;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export interface NsCliBaseContext {
	cwd: string;
	env: Record<string, string | undefined>;
	homeDir?: string;
	textGenerator: TextGenerator;
	exec: NsExtensionApi["exec"];
	stdout?: NsExtensionApi["stdout"];
	stderr?: NsExtensionApi["stderr"];
	stdin?: NsExtensionApi["stdin"];
	onOutput?: NsExtensionApi["onOutput"];
	confirm?: NsExtensionApi["confirm"];
	extensions?: NsExtensionApi["extensions"];
}

export interface CreateNsExtensionApiOptions {
	baseContext: NsCliBaseContext;
	cwd: string;
	env: Record<string, string | undefined>;
	homeDir?: string;
	extensionPackageNames: ReadonlySet<string>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	renderCapabilities: RenderCapabilities;
	outputFormat: ClinkrFormat;
	stdin?: () => Promise<string>;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
}

/** Constructs the complete extension API shared by command execution and completion. */
export function createNsExtensionApi(options: CreateNsExtensionApiOptions): NsExtensionApi {
	return {
		cwd: options.cwd,
		env: options.env,
		...optionalEntry("homeDir", options.homeDir),
		textGenerator: options.baseContext.textGenerator,
		commandIo: createCliCommandIo({
			stdout: options.stdout,
			stderr: options.stderr,
			...optionalEntry("onOutput", options.onOutput),
		}),
		progress:
			options.onProgress === undefined
				? noopNsProgress
				: { isLive: true, phase: options.onProgress },
		renderCapabilities: options.renderCapabilities,
		outputFormat: options.outputFormat,
		exec: options.baseContext.exec.bind(options.baseContext),
		hasExtension: (packageName) => options.extensionPackageNames.has(packageName),
		stdout: options.stdout,
		stderr: options.stderr,
		...optionalEntry("stdin", options.stdin),
		...optionalEntry("onOutput", options.onOutput),
		...optionalEntry("confirm", options.confirm),
		...optionalEntry("extensions", options.baseContext.extensions),
	};
}

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
	return {
		cwd,
		env,
		...optionalEntry("homeDir", homeDir),
		textGenerator: options.textGenerator,
		stdout: (text) => process.stdout.write(text),
		stderr: (text) => process.stderr.write(text),
		exec: async (command, args, execOptions = {}) => {
			return await runCommand(command, args, {
				cwd: execOptions.cwd ?? cwd,
				env: execEnv,
				...(execOptions.timeoutMs === undefined ? {} : { timeout: execOptions.timeoutMs }),
				...(execOptions.stdin === undefined ? {} : { stdin: execOptions.stdin }),
				...(execOptions.onStdout === undefined ? {} : { onStdout: execOptions.onStdout }),
				...(execOptions.onStderr === undefined ? {} : { onStderr: execOptions.onStderr }),
			});
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
