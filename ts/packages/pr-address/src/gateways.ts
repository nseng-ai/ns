import { runCommand, type ExecResult } from "@asdl/core/exec";
import { commandFailure } from "@asdl/core/submit";

import type {
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	PrAddressGitGateway,
	RepoContextResult,
} from "./core/gateways.ts";

export type {
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	PrAddressGitGateway,
	RepoContextResult,
} from "./core/gateways.ts";

export interface ProcessRequest {
	command: string;
	args: readonly string[];
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
	timeout?: number | undefined;
}

export interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	command?: string | undefined;
	args?: readonly string[] | undefined;
}

export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

const GIT_TIMEOUT_MS = 10_000;

export class RealPrAddressGitGateway implements PrAddressGitGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: { runProcess?: ProcessRunner | undefined } = {}) {
		this.runProcess = options.runProcess ?? runProcess;
	}

	async getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult> {
		const result = await this.runProcess({
			command: "git",
			args: ["branch", "--show-current"],
			cwd: options.cwd,
			env: options.env,
			timeout: GIT_TIMEOUT_MS,
		});
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const branch = result.stdout.trim();
		if (branch === "") return { type: "detached" };
		return { type: "branch", branch };
	}

	async isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult> {
		const result = await this.runProcess({
			command: "git",
			args: ["rev-parse", "--is-inside-work-tree"],
			cwd: options.cwd,
			env: options.env,
			timeout: GIT_TIMEOUT_MS,
		});
		if (result.exitCode === 0)
			return result.stdout.trim() === "true" ? { type: "inside" } : { type: "outside" };
		// git exits 128 with "not a git repository" outside any work tree.
		if (result.exitCode === 128) return { type: "outside" };
		return { type: "failure", failure: failureFromProcess(result) };
	}
}

export async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
	const result = await runCommand(request.command, request.args, {
		cwd: request.cwd,
		...(request.env === undefined ? {} : { env: request.env }),
		...(request.timeout === undefined ? {} : { timeout: request.timeout }),
	});
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.code,
		command: request.command,
		args: request.args,
	};
}

function failureFromProcess(result: ProcessResult): GatewayFailure {
	const stderr = result.stderr.trim();
	const stdout = result.stdout.trim();
	const message =
		stderr !== "" ? stderr : stdout !== "" ? stdout : `process exited with code ${result.exitCode}`;
	const failure = commandFailure({
		command: result.command ?? "process",
		args: result.args ?? [],
		result: execResultFromProcess(result),
		code: "process_failed",
		message,
	}) ?? { code: "process_failed", message, details: {} };
	return {
		...failure,
		stdout: result.stdout,
		stderr: result.stderr,
		returncode: result.exitCode,
		details: {
			...failure.details,
			stdout: result.stdout,
			stderr: result.stderr,
			returncode: result.exitCode,
		},
	};
}

function execResultFromProcess(result: ProcessResult): ExecResult {
	return { stdout: result.stdout, stderr: result.stderr, code: result.exitCode, killed: false };
}
