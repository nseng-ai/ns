import { join } from "node:path";

import { resolveHomeDir } from "@nseng-ai/foundation/primitives";
import { runCli, type NsCliDeps } from "@nseng-ai/kernel/cli";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/kernel/sdk";
import type {
	NsExecOptions,
	ExecResult,
	NsConfirmPrompt,
	NsExtensionApi,
	RenderCapabilities,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/kernel/sdk";

export type ScriptedTextGenerationResult = TextGenerationResult | Promise<TextGenerationResult>;

export interface ScriptedExecResponse {
	match: string | RegExp | ((call: ExecCall) => boolean);
	result: Partial<Extract<ExecResult, { type: "exited" }>>;
	isRepeatable?: boolean;
}

export interface ExecCall {
	command: string;
	args: string[];
	options: NsExecOptions | undefined;
}

export interface TestState {
	exec?: readonly ScriptedExecResponse[];
	textGeneration?: readonly ScriptedTextGenerationResult[];
	confirm?: NsConfirmPrompt;
	stdin?: string;
	extensions?: Readonly<Record<string, unknown>>;
}

export interface RunWithFakesOptions {
	args: readonly string[];
	state?: TestState;
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
	renderCapabilities?: RenderCapabilities;
	onProgress?: NsCliDeps["onProgress"];
	extensionRegistry?: NsCliDeps["extensionRegistry"];
}

export interface RunWithFakesDefaults {
	execResponses: () => readonly ScriptedExecResponse[];
	textGenerationResults: () => readonly ScriptedTextGenerationResult[];
	missingTextGenerationResult?: () => TextGenerationResult;
}

interface ScriptedNsTestContextOptions extends RunWithFakesDefaults {
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
}

export class ScriptedNsTestContext implements NsExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly homeDir?: string;
	readonly execCalls: ExecCall[] = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	onOutput?: (stream: "stdout" | "stderr", text: string) => void;
	confirm?: NsConfirmPrompt;
	stdin?: () => Promise<string>;
	extensions?: Readonly<Record<string, unknown>>;
	private readonly execResponses: ScriptedExecResponse[];
	private readonly textGenerationResults: ScriptedTextGenerationResult[];
	private readonly missingTextGenerationResult: (() => TextGenerationResult) | undefined;

	constructor(state: TestState = {}, options: ScriptedNsTestContextOptions) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		const homeDir = resolveHomeDir(options.homeDir, this.env);
		if (homeDir !== undefined) this.homeDir = homeDir;
		this.execResponses = [...(state.exec ?? options.execResponses())];
		this.textGenerationResults = [...(state.textGeneration ?? options.textGenerationResults())];
		this.missingTextGenerationResult = options.missingTextGenerationResult;
		if (state.confirm !== undefined) this.confirm = state.confirm;
		this.stdin = async () => state.stdin ?? "";
		if (state.extensions !== undefined) this.extensions = state.extensions;
	}

	async exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult> {
		const call = { command, args: [...args], options };
		this.execCalls.push(call);
		const index = this.execResponses.findIndex((response) => responseMatches(response.match, call));
		if (index === -1) {
			return execResult({ code: 99, stderr: `unexpected command: ${formatExecCall(call)}` });
		}
		const response = this.execResponses[index];
		if (response === undefined) {
			return execResult({ code: 99, stderr: `missing command response: ${formatExecCall(call)}` });
		}
		if (response.isRepeatable !== true) this.execResponses.splice(index, 1);
		const result = execResult(response.result);
		options?.onStdout?.(result.stdout);
		options?.onStderr?.(result.stderr);
		return result;
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.textGeneratorCalls.push({ ...request });
			return await (this.textGenerationResults.shift() ??
				this.missingTextGenerationResult?.() ?? {
					ok: false,
					error: "missing scripted text result",
				});
		},
	};
}

export function runCliWithFakes(options: RunWithFakesOptions, defaults: RunWithFakesDefaults) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const cwd = options.cwd ?? "/work";
	const homeDir = options.homeDir ?? join(cwd, ".home");
	const context = new ScriptedNsTestContext(options.state, {
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
		env: { HOME: homeDir, ...(options.env ?? {}) },
		homeDir,
		execResponses: defaults.execResponses,
		textGenerationResults: defaults.textGenerationResults,
		...(defaults.missingTextGenerationResult === undefined
			? {}
			: { missingTextGenerationResult: defaults.missingTextGenerationResult }),
	});
	return {
		context,
		stdout,
		stderr,
		liveOutput,
		exit: runCli(options.args, {
			context,
			cwd: context.cwd,
			homeDir,
			env: context.env,
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
			onOutput: (stream, text) => {
				liveOutput.push({ stream, text });
			},
			...(options.renderCapabilities === undefined
				? {}
				: { renderCapabilities: options.renderCapabilities }),
			...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
			...(options.state?.confirm === undefined ? {} : { confirm: options.state.confirm }),
			...(options.extensionRegistry === undefined
				? {}
				: { extensionRegistry: options.extensionRegistry }),
		}),
	};
}

export function execResult(
	result: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): ExecResult {
	return {
		type: "exited",
		code: result.code ?? 0,
		signal: result.signal ?? null,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

export function formatExecCall(call: ExecCall): string {
	return [call.command, ...call.args].join(" ");
}

export function formattedExecCalls(context: ScriptedNsTestContext): string[] {
	return context.execCalls.map(formatExecCall);
}

export function parseJsonOutput(run: { stdout: readonly string[] }): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected JSON object output.");
	}
	return value as Record<string, unknown>;
}

function responseMatches(match: ScriptedExecResponse["match"], call: ExecCall): boolean {
	const display = formatExecCall(call);
	if (typeof match === "string") return match === display;
	if (match instanceof RegExp) return match.test(display);
	return match(call);
}
