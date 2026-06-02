import { runCommand, type CommandResult as RunnerCommandResult, type CommandRunner } from "./command-runner.ts";
import { createCommitWithPreparedMessage, prepareCheckpointMessage, type CommandResult } from "./checkpoint-flow.ts";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "./pending-worktree.ts";
import { selectCheckpointTextGenerationConfig, type TextGenerationGateway } from "./text-generation.ts";

export type CheckpointGateway = {
	loadPendingWorktreeSnapshot(params: { cwd: string }): Promise<
		| {
				ok: true;
				snapshot: PendingWorktreeSnapshot;
			}
		| {
				ok: false;
				error: PendingWorktreeError;
			}
	>;
	createCommitWithPreparedMessage(params: { cwd: string; message: string }): Promise<{ summary: string } | { error: string }>;
};

export type CheckpointCommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type RunCheckpointCommandOptions = {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: CheckpointGateway;
	textGeneration: TextGenerationGateway;
};

export class RealCheckpointGateway implements CheckpointGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async loadPendingWorktreeSnapshot(params: { cwd: string }): Promise<
		| {
				ok: true;
				snapshot: PendingWorktreeSnapshot;
			}
		| {
				ok: false;
				error: PendingWorktreeError;
			}
	> {
		return loadPendingWorktreeSnapshot({
			cwd: params.cwd,
			execGit: (args, timeout) => this.exec("git", args, params.cwd, timeout),
		});
	}

	async createCommitWithPreparedMessage(params: { cwd: string; message: string }): Promise<{ summary: string } | { error: string }> {
		return createCommitWithPreparedMessage({
			cwd: params.cwd,
			message: params.message,
			exec: (command, args, cwd, timeout) => this.exec(command, args, cwd, timeout),
		});
	}

	private async exec(command: string, args: string[], cwd: string, timeout: number): Promise<CommandResult> {
		const result = await this.runner(command, args, { cwd, timeoutMs: timeout });
		return toCheckpointCommandResult(result);
	}
}

export async function runCheckpointCommand(options: RunCheckpointCommandOptions): Promise<CheckpointCommandResult> {
	const textConfig = selectCheckpointTextGenerationConfig(options.env);
	if (!textConfig.ok) {
		return failure(2, textConfig.error);
	}

	const loaded = await options.gateway.loadPendingWorktreeSnapshot({ cwd: options.cwd });
	if (!loaded.ok) {
		return failure(2, formatCheckpointSnapshotError(loaded.error));
	}

	const snapshot = loaded.snapshot;
	if (snapshot.branch === "main" || snapshot.branch === "master") {
		return failure(1, `Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`);
	}
	if (snapshot.clean) {
		return failure(1, "Working tree is clean; nothing to checkpoint.");
	}

	const prepared = await prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		textGeneration: options.textGeneration,
		modelRef: textConfig.value.modelRef,
	});
	if (!prepared.ok) {
		return failure(2, prepared.error);
	}

	const committed = await options.gateway.createCommitWithPreparedMessage({ cwd: options.cwd, message: prepared.message });
	if ("error" in committed) {
		return failure(2, committed.error);
	}

	return {
		exitCode: 0,
		stdout: `${committed.summary}\n${prepared.message}\n`,
		stderr: "",
	};
}

function formatCheckpointSnapshotError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Could not determine current branch.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not inspect git status.\n${details}`;
	}
	return `Could not capture git diff.\n${details}`;
}

function toCheckpointCommandResult(result: RunnerCommandResult): CommandResult {
	const converted: CommandResult = {
		code: result.exitCode,
		stdout: result.stdout,
		stderr: appendStartupError(result.stderr, result.startupError),
	};
	if (result.killed === true) {
		converted.killed = true;
	}
	return converted;
}

function appendStartupError(stderr: string, startupError: string | undefined): string {
	if (startupError === undefined) {
		return stderr;
	}
	return [stderr.trimEnd(), startupError].filter(Boolean).join("\n");
}

function failure(exitCode: number, error: string): CheckpointCommandResult {
	return {
		exitCode,
		stdout: "",
		stderr: error.endsWith("\n") ? error : `${error}\n`,
	};
}
