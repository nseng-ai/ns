import { join } from "node:path";

import { runCli, type SdlCliDeps } from "@sdl/kernel/cli";
import type { SlotCliContext } from "@sdl/slot";
import type {
	SdlExecOptions,
	ExecResult,
	SdlConfirmPrompt,
	SdlExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "sdl-sdk";

export type ScriptedTextGenerationResult = TextGenerationResult | Promise<TextGenerationResult>;

export interface ScriptedExecResponse {
	match: string | RegExp | ((call: ExecCall) => boolean);
	result: Partial<ExecResult>;
	isRepeatable?: boolean | undefined;
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
	stdin?: string | undefined;
	extensions?: Readonly<Record<string, unknown>> | undefined;
}

export interface RunWithFakesOptions {
	args: readonly string[];
	state?: TestState | undefined;
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
	homeDir?: string | undefined;
	extensionRegistry?: SdlCliDeps["extensionRegistry"] | undefined;
	useRealSlotContext?: boolean | undefined;
	createSlotContext?: SdlCliDeps["createSlotContext"] | undefined;
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

export class ScriptedSdlTestContext implements SdlExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: ExecCall[] = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
	confirm?: SdlConfirmPrompt | undefined;
	stdin?: (() => Promise<string>) | undefined;
	extensions?: Readonly<Record<string, unknown>> | undefined;
	private readonly execResponses: ScriptedExecResponse[];
	private readonly textGenerationResults: ScriptedTextGenerationResult[];
	private readonly missingTextGenerationResult: (() => TextGenerationResult) | undefined;

	constructor(state: TestState = {}, options: ScriptedSdlTestContextOptions) {
		this.cwd = options.cwd ?? "/work";
		this.env = options.env ?? {};
		this.execResponses = [...(state.exec ?? options.execResponses())];
		this.textGenerationResults = [...(state.textGeneration ?? options.textGenerationResults())];
		this.missingTextGenerationResult = options.missingTextGenerationResult;
		this.confirm = state.confirm;
		this.stdin = async () => state.stdin ?? "";
		this.extensions = state.extensions;
	}

	async exec(command: string, args: string[], options?: SdlExecOptions): Promise<ExecResult> {
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
	const context = new ScriptedSdlTestContext(options.state, {
		cwd: options.cwd,
		env: { HOME: homeDir, ...(options.env ?? {}) },
		execResponses: defaults.execResponses,
		textGenerationResults: defaults.textGenerationResults,
		missingTextGenerationResult: defaults.missingTextGenerationResult,
	});
	const createSlotContext =
		options.createSlotContext ??
		(options.useRealSlotContext === true
			? undefined
			: ({ cwd: slotCwd, env }) =>
					fakeSlotContext({
						cwd: slotCwd,
						env,
						slotsRoot: join(homeDir, ".sdl", "slots"),
						stderr: (text) => stderr.push(text),
					}));
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
			...(options.extensionRegistry === undefined
				? {}
				: { extensionRegistry: options.extensionRegistry }),
			...(createSlotContext === undefined ? {} : { createSlotContext }),
		}),
	};
}

function fakeSlotContext(options: {
	cwd: string;
	env: NodeJS.ProcessEnv;
	slotsRoot: string;
	stderr: (text: string) => void;
}): SlotCliContext {
	return {
		repo: {
			type: "no_repo",
			errorType: "not-in-repo",
			message: "fake kernel CLI test context: repo discovery not performed",
		},
		git: {
			async pathExists(_path) {
				return unexpectedSlotGatewayCall("git.pathExists");
			},
			async getGitCommonDir(_cwd) {
				return unexpectedSlotGatewayCall("git.getGitCommonDir");
			},
			async getRepositoryRoot(_cwd) {
				return unexpectedSlotGatewayCall("git.getRepositoryRoot");
			},
			async listWorktrees() {
				return unexpectedSlotGatewayCall("git.listWorktrees");
			},
			async listBranchOccupancies() {
				return unexpectedSlotGatewayCall("git.listBranchOccupancies");
			},
			async listLocalBranches() {
				return unexpectedSlotGatewayCall("git.listLocalBranches");
			},
			async listLocalBranchTips() {
				return unexpectedSlotGatewayCall("git.listLocalBranchTips");
			},
			async hasUncommittedChanges(_path) {
				return unexpectedSlotGatewayCall("git.hasUncommittedChanges");
			},
			async getTrunkBranch() {
				return unexpectedSlotGatewayCall("git.getTrunkBranch");
			},
			async getCurrentBranch(_cwd) {
				return unexpectedSlotGatewayCall("git.getCurrentBranch");
			},
			async getPreviousBranch(_cwd) {
				return unexpectedSlotGatewayCall("git.getPreviousBranch");
			},
			async branchExists(_branch) {
				return unexpectedSlotGatewayCall("git.branchExists");
			},
			async createBranch(_branch, _startPoint, _options) {
				return unexpectedSlotGatewayCall("git.createBranch");
			},
			async deleteLocalBranch(_branch, _options) {
				return unexpectedSlotGatewayCall("git.deleteLocalBranch");
			},
			async checkoutBranch(_cwd, _branch) {
				return unexpectedSlotGatewayCall("git.checkoutBranch");
			},
			async detachHead(_cwd, _ref) {
				return unexpectedSlotGatewayCall("git.detachHead");
			},
			async addDetachedWorktree(_path, _ref) {
				unexpectedSlotGatewayCall("git.addDetachedWorktree");
			},
			async removeWorktree(_path) {
				unexpectedSlotGatewayCall("git.removeWorktree");
			},
		},
		gt: {
			async parentOf(_cwd) {
				return unexpectedSlotGatewayCall("gt.parentOf");
			},
			async childrenOf(_cwd) {
				return unexpectedSlotGatewayCall("gt.childrenOf");
			},
			async trunk(_cwd) {
				return unexpectedSlotGatewayCall("gt.trunk");
			},
			async stack(_cwd) {
				return unexpectedSlotGatewayCall("gt.stack");
			},
			async stackGraph(_cwd) {
				return unexpectedSlotGatewayCall("gt.stackGraph");
			},
		},
		pr: {
			async getPrForBranch(_branch) {
				return unexpectedSlotGatewayCall("pr.getPrForBranch");
			},
			async getPrsForBranches(_branches) {
				return unexpectedSlotGatewayCall("pr.getPrsForBranches");
			},
			async closePr(_number) {
				return unexpectedSlotGatewayCall("pr.closePr");
			},
		},
		storage: {
			async ensureDir(_path) {
				unexpectedSlotGatewayCall("storage.ensureDir");
			},
		},
		clipboard: {
			async copy(_text) {
				return unexpectedSlotGatewayCall("clipboard.copy");
			},
		},
		command: {
			async run(_command, _args, _runOptions) {
				return unexpectedSlotGatewayCall("command.run");
			},
		},
		cwd: options.cwd,
		interaction: {
			async confirm(_request) {
				return unexpectedSlotGatewayCall("interaction.confirm");
			},
			isInteractive() {
				return false;
			},
		},
		stderr: options.stderr,
		env: options.env,
		slotsRoot: options.slotsRoot,
		shouldWriteCdDirective: false,
	};
}

function unexpectedSlotGatewayCall(operation: string): never {
	throw new Error(`unexpected Slot ${operation} call in kernel CLI fake`);
}

export function execResult(result: Partial<ExecResult> = {}): ExecResult {
	return {
		code: result.code ?? 0,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		killed: result.killed ?? false,
	};
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
