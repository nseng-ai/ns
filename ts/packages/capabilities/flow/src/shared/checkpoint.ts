import { runCommand, type CommandRunner, type ExecResult } from "@sdl/core/exec";
import { createSdlCommandRunner } from "@sdl/capability-kit/command-runner";
import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
} from "@sdl/domain-primitives-transitional/checkpoint-flow";
import type { SdlExtensionApi } from "@sdl/sdl/sdk";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "@sdl/domain-primitives-transitional/pending-worktree";
import {
	selectCheckpointModelRef,
	type TextGenerator,
} from "@sdl/domain-primitives-transitional/text-generation";

export interface CheckpointGateway {
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
	createCommitWithPreparedMessage(params: {
		cwd: string;
		message: string;
	}): Promise<{ summary: string } | { error: string }>;
}

export interface CheckpointCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface SdlCheckpointRuntime {
	checkpointGateway: CheckpointGateway;
}

export function createSdlCheckpointRuntime(ctx: SdlExtensionApi): SdlCheckpointRuntime {
	return {
		checkpointGateway: new RealCheckpointGateway(createSdlCommandRunner(ctx)),
	};
}

export interface RunCheckpointCommandOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: CheckpointGateway;
	textGenerator: TextGenerator;
}

export interface RunCheckpointWorkflowOptions extends RunCheckpointCommandOptions {
	dryRun: boolean;
}

export type CheckpointWorkflowResult =
	| { type: "snapshot-failed"; error: PendingWorktreeError }
	| { type: "trunk"; branch: string }
	| { type: "clean" }
	| { type: "message-failed"; error: string }
	| { type: "dry-run"; branch: string; message: string }
	| { type: "commit-failed"; error: string }
	| { type: "committed"; summary: string; message: string };

export type CheckpointIfPendingResult =
	| {
			kind: "clean";
	  }
	| {
			kind: "checkpointed";
			output: CheckpointCommandResult;
	  }
	| {
			kind: "failed";
			output: CheckpointCommandResult;
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

	async createCommitWithPreparedMessage(params: {
		cwd: string;
		message: string;
	}): Promise<{ summary: string } | { error: string }> {
		return createCommitWithPreparedMessage({
			cwd: params.cwd,
			message: params.message,
			exec: (command, args, cwd, timeout) => this.exec(command, args, cwd, timeout),
		});
	}

	private async exec(
		command: string,
		args: string[],
		cwd: string,
		timeout: number,
	): Promise<CommandResult> {
		const result = await this.runner(command, args, { cwd, timeout });
		return toCheckpointCommandResult(result);
	}
}

export async function runCheckpointIfPending(
	options: RunCheckpointCommandOptions,
): Promise<CheckpointIfPendingResult> {
	const result = await runCheckpointWorkflow({ ...options, dryRun: false });
	switch (result.type) {
		case "snapshot-failed":
			return { kind: "failed", output: failure(2, formatCheckpointSnapshotError(result.error)) };
		case "clean":
			return { kind: "clean" };
		case "trunk":
			return {
				kind: "failed",
				output: failure(
					1,
					`Refusing to create checkpoint commit on trunk branch: ${result.branch}`,
				),
			};
		case "message-failed":
			return { kind: "failed", output: failure(2, result.error) };
		case "commit-failed":
			return { kind: "failed", output: failure(2, result.error) };
		case "committed":
			return {
				kind: "checkpointed",
				output: {
					exitCode: 0,
					stdout: `${result.summary}\n${result.message}\n`,
					stderr: "",
				},
			};
		case "dry-run":
			throw new Error("runCheckpointIfPending does not support dry-run checkpoint results.");
	}
}

export async function runCheckpointWorkflow(
	options: RunCheckpointWorkflowOptions,
): Promise<CheckpointWorkflowResult> {
	const loaded = await options.gateway.loadPendingWorktreeSnapshot({ cwd: options.cwd });
	if (!loaded.ok) return { type: "snapshot-failed", error: loaded.error };

	const snapshot = loaded.snapshot;
	if (snapshot.branch === "main" || snapshot.branch === "master") {
		return { type: "trunk", branch: snapshot.branch };
	}
	if (snapshot.clean) return { type: "clean" };

	const prepared = await prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		textGenerator: options.textGenerator,
		modelRef: selectCheckpointModelRef(options.env),
	});
	if (!prepared.ok) return { type: "message-failed", error: prepared.error };

	if (options.dryRun) {
		return { type: "dry-run", branch: snapshot.branch, message: prepared.message };
	}

	const committed = await options.gateway.createCommitWithPreparedMessage({
		cwd: options.cwd,
		message: prepared.message,
	});
	if ("error" in committed) return { type: "commit-failed", error: committed.error };

	return { type: "committed", summary: committed.summary, message: prepared.message };
}

export function formatCheckpointSnapshotError(error: PendingWorktreeError): string {
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

function toCheckpointCommandResult(result: ExecResult): CommandResult {
	const converted: CommandResult = {
		code: result.code,
		stdout: result.stdout,
		stderr: result.stderr,
	};
	if (result.killed) {
		converted.killed = true;
	}
	return converted;
}

function failure(exitCode: number, error: string): CheckpointCommandResult {
	return {
		exitCode,
		stdout: "",
		stderr: error.endsWith("\n") ? error : `${error}\n`,
	};
}
