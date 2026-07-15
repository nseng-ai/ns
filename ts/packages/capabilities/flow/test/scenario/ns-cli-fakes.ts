import { join } from "node:path";

import { runCli } from "@nseng-ai/sdk/cli";
import { createCliCommandIo } from "@nseng-ai/sdk/command-io";
import { noopNsProgress } from "@nseng-ai/sdk";
import type {
	NsExecOptions,
	ExecResult,
	NsConfirmPrompt,
	NsExtensionApi,
	NsProgress,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";

export type ScriptedTextGenerationResult = TextGenerationResult | Promise<TextGenerationResult>;

interface ExitedResultFields {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number | null;
	readonly signal?: string | null;
}

type ScriptedExecResult = ExecResult | ExitedResultFields;

export interface ScriptedExecResponse {
	match: string | RegExp | ((call: ExecCall) => boolean);
	result: ScriptedExecResult | ((call: ExecCall) => ScriptedExecResult);
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
}

export interface RunWithFakesOptions {
	args: readonly string[];
	state?: TestState;
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
}

export interface RunWithFakesDefaults {
	execResponses: () => readonly ScriptedExecResponse[];
	textGenerationResults: () => readonly ScriptedTextGenerationResult[];
	missingTextGenerationResult?: () => TextGenerationResult;
}

interface ScriptedNsTestContextOptions extends RunWithFakesDefaults {
	cwd?: string;
	env?: Record<string, string | undefined>;
	progress?: NsProgress;
}

export class ScriptedNsTestContext implements NsExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	readonly commandIo = createCliCommandIo({
		stdout: (text) => this.stdout?.(text),
		stderr: (text) => this.stderr?.(text),
		onOutput: (stream, text) => this.onOutput?.(stream, text),
	});
	readonly progress: NsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	onOutput?: (stream: "stdout" | "stderr", text: string) => void;
	confirm?: NsConfirmPrompt;
	private readonly execResponses: ScriptedExecResponse[];
	private readonly textGenerationResults: ScriptedTextGenerationResult[];
	private readonly missingTextGenerationResult: (() => TextGenerationResult) | undefined;
	private explicitRootFailure: ScriptedExecResult | undefined;

	constructor(state: TestState = {}, options: ScriptedNsTestContextOptions) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.progress = options.progress ?? noopNsProgress;
		this.execResponses = [...(state.exec ?? options.execResponses())];
		this.textGenerationResults = [...(state.textGeneration ?? options.textGenerationResults())];
		this.missingTextGenerationResult = options.missingTextGenerationResult;
		if (state.confirm !== undefined) this.confirm = state.confirm;
	}

	async exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult> {
		const call = { command, args: [...args], options };
		if (formatExecCall(call) === "git rev-parse --show-toplevel") {
			if (this.explicitRootFailure !== undefined) return execResult(this.explicitRootFailure);
			const scriptedRoot = this.execResponses.find(
				(response) =>
					responseMatches(response.match, call) &&
					typeof response.result !== "function" &&
					"code" in response.result &&
					response.result.code !== undefined &&
					response.result.code !== 0,
			);
			if (scriptedRoot !== undefined && typeof scriptedRoot.result !== "function") {
				this.explicitRootFailure = scriptedRoot.result;
				return execResult(scriptedRoot.result);
			}
		}
		const index = this.execResponses.findIndex((response) => responseMatches(response.match, call));
		if (index === -1) {
			// Repository-root discovery is a shared boundary concern. Most flow
			// scenarios should not have to script this incidental probe, while an
			// explicitly scripted response (including a failure) still wins above.
			if (formatExecCall(call) === "git rev-parse --show-toplevel") {
				this.execCalls.push(call);
				return execResult({ stdout: `${this.cwd}\n` });
			}
			this.execCalls.push(call);
			return execResult({ code: 99, stderr: `unexpected command: ${formatExecCall(call)}` });
		}
		const scripted = this.execResponses[index];
		if (
			scripted !== undefined &&
			formatExecCall(call) === "git rev-parse --show-toplevel" &&
			typeof scripted.result !== "function" &&
			"code" in scripted.result &&
			scripted.result.code !== undefined &&
			scripted.result.code !== 0
		) {
			this.execResponses.splice(index, 1);
			this.explicitRootFailure = scripted.result;
			return execResult(scripted.result);
		}
		this.execCalls.push(call);
		const [response] = this.execResponses.splice(index, 1);
		if (response === undefined) {
			return execResult({ code: 99, stderr: `missing command response: ${formatExecCall(call)}` });
		}
		const result = execResult(
			typeof response.result === "function" ? response.result(call) : response.result,
		);
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
			...(options.state?.confirm === undefined ? {} : { confirm: options.state.confirm }),
		}),
	};
}

export function execResult(result: ScriptedExecResult = {}): ExecResult {
	if ("type" in result) return result;
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
	const calls = context.execCalls.map(formatExecCall);
	return calls.filter(
		(call, index) =>
			call !== "git rev-parse --show-toplevel" ||
			index === 0 ||
			calls[index - 1] !== "git rev-parse --show-toplevel",
	);
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
