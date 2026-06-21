import { join } from "node:path";

import { runCli } from "@sdl/sdl/cli";
import { createSdlCommandResult } from "@sdl/sdl/sdk";
import type {
	SdlExecOptions,
	ExecResult,
	SdlCommandResult,
	SdlConfirmPrompt,
	SdlContext,
	TextGenerationRequest,
	TextGenerationResult,
} from "@sdl/sdl/sdk";

export type ScriptedTextGenerationResult = TextGenerationResult | Promise<TextGenerationResult>;

export interface ScriptedExecResponse {
	match: string | RegExp | ((call: ExecCall) => boolean);
	result: Partial<ExecResult>;
}

export interface ExecCall {
	command: string;
	args: string[];
	options: SdlExecOptions | undefined;
}

export interface TestState {
	exec?: readonly ScriptedExecResponse[];
	textGeneration?: readonly ScriptedTextGenerationResult[];
	confirm?: SdlConfirmPrompt | undefined;
}

export interface RunWithFakesOptions {
	args: readonly string[];
	state?: TestState | undefined;
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
	homeDir?: string | undefined;
}

export interface RunWithFakesDefaults {
	execResponses: () => readonly ScriptedExecResponse[];
	textGenerationResults: () => readonly ScriptedTextGenerationResult[];
	missingTextGenerationResult?: (() => TextGenerationResult) | undefined;
}

interface ScriptedSdlTestContextOptions extends RunWithFakesDefaults {
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
}

export class ScriptedSdlTestContext implements SdlContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly modelCalls: TextGenerationRequest[] = [];
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
	confirm?: SdlConfirmPrompt | undefined;
	private readonly execResponses: ScriptedExecResponse[];
	private readonly modelResults: ScriptedTextGenerationResult[];
	private readonly missingTextGenerationResult: (() => TextGenerationResult) | undefined;

	constructor(state: TestState = {}, options: ScriptedSdlTestContextOptions) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.execResponses = [...(state.exec ?? options.execResponses())];
		this.modelResults = [...(state.textGeneration ?? options.textGenerationResults())];
		this.missingTextGenerationResult = options.missingTextGenerationResult;
		this.confirm = state.confirm;
	}

	async exec(command: string, args: string[], options?: SdlExecOptions): Promise<SdlCommandResult> {
		const call = { command, args: [...args], options };
		this.execCalls.push(call);
		const index = this.execResponses.findIndex((response) => responseMatches(response.match, call));
		if (index === -1) {
			return execResult({
				result: { code: 99, stderr: `unexpected command: ${formatExecCall(call)}` },
				metadata: { command, args, cwd: this.cwd },
			});
		}
		const [response] = this.execResponses.splice(index, 1);
		if (response === undefined) {
			return execResult({
				result: { code: 99, stderr: `missing command response: ${formatExecCall(call)}` },
				metadata: { command, args, cwd: this.cwd },
			});
		}
		const result = execResult({
			result: response.result,
			metadata: { command, args, cwd: this.cwd },
		});
		options?.onStdout?.(result.stdout);
		options?.onStderr?.(result.stderr);
		return result;
	}

	readonly model = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.modelCalls.push({ ...request });
			return await (this.modelResults.shift() ??
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
	const context = new ScriptedSdlTestContext(options.state, {
		cwd: options.cwd,
		env: { HOME: homeDir, ...(options.env ?? {}) },
		execResponses: defaults.execResponses,
		textGenerationResults: defaults.textGenerationResults,
		missingTextGenerationResult: defaults.missingTextGenerationResult,
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
			...(options.state?.confirm === undefined ? {} : { confirm: options.state.confirm }),
		}),
	};
}

export interface ExecResultMetadata {
	command?: string | undefined;
	args?: readonly string[] | undefined;
	cwd?: string | undefined;
}

export interface ExecResultOptions {
	result?: Partial<ExecResult> | undefined;
	metadata?: ExecResultMetadata | undefined;
}

export function execResult(options: ExecResultOptions = {}): SdlCommandResult {
	const result = options.result ?? {};
	const metadata = options.metadata ?? {};
	return createSdlCommandResult({
		command: metadata.command ?? "command",
		args: metadata.args ?? [],
		cwd: metadata.cwd ?? "/work",
		result: {
			code: result.code ?? 0,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			killed: result.killed ?? false,
			...(result.startupError === undefined ? {} : { startupError: result.startupError }),
		},
	});
}

export function formatExecCall(call: ExecCall): string {
	return [call.command, ...call.args].join(" ");
}

export function formattedExecCalls(context: ScriptedSdlTestContext): string[] {
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
