import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { runCommand } from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import type { NsProgressPhaseListener } from "@nseng-ai/kernel/sdk";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import { createNsCommandRunner } from "@nseng-ai/capability-kit/command-runner";
import type { TextRepairProgressEvent } from "@nseng-ai/capability-kit/text-repair";
import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
} from "@nseng-ai/capability-kit/checkpoint-flow";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "@nseng-ai/capability-kit/pending-worktree";
import {
	selectCheckpointModelRef,
	type TextGenerator,
} from "@nseng-ai/capability-kit/text-generation";

export interface CheckpointGateway {
	loadPendingWorktreeSnapshot(params: { cwd: string; repoRoot?: string }): Promise<
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

export interface NsCheckpointRuntime {
	checkpointGateway: CheckpointGateway;
}

export function createNsCheckpointRuntime(ctx: NsExtensionApi): NsCheckpointRuntime {
	return {
		checkpointGateway: new RealCheckpointGateway(createNsCommandRunner(ctx)),
	};
}

export interface RunCheckpointCommandOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	gateway: CheckpointGateway;
	textGenerator: TextGenerator;
	repoRoot?: string;
	/** Typed phase sequencing for a presentation driver (inspect → generate → commit). */
	onPhase?: NsProgressPhaseListener;
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

	async loadPendingWorktreeSnapshot(params: { cwd: string; repoRoot?: string }): Promise<
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
			...optionalEntry("repoRoot", params.repoRoot),
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
	const onPhase = options.onPhase;
	onPhase?.({ type: "phase-started", phaseKey: "inspect" });
	const loaded = await options.gateway.loadPendingWorktreeSnapshot({
		cwd: options.cwd,
		...optionalEntry("repoRoot", options.repoRoot),
	});
	if (!loaded.ok) return { type: "snapshot-failed", error: loaded.error };

	const snapshot = loaded.snapshot;
	if (snapshot.branch === "main" || snapshot.branch === "master") {
		return { type: "trunk", branch: snapshot.branch };
	}
	if (snapshot.clean) return { type: "clean" };

	onPhase?.({ type: "phase-started", phaseKey: "generate" });
	const prepared = await prepareCheckpointMessage({
		status: snapshot.status,
		diff: snapshot.diff,
		textGenerator: options.textGenerator,
		modelRef: selectCheckpointModelRef(options.env),
		...(onPhase === undefined
			? {}
			: {
					onProgress: (event) =>
						onPhase({
							type: "phase-progress",
							phaseKey: "generate",
							label: formatCheckpointProgressEvent(event),
						}),
				}),
	});
	if (!prepared.ok) return { type: "message-failed", error: prepared.error };

	if (options.dryRun) {
		return { type: "dry-run", branch: snapshot.branch, message: prepared.message };
	}

	onPhase?.({ type: "phase-started", phaseKey: "commit" });
	const committed = await options.gateway.createCommitWithPreparedMessage({
		cwd: options.cwd,
		message: prepared.message,
	});
	if ("error" in committed) return { type: "commit-failed", error: committed.error };

	return { type: "committed", summary: committed.summary, message: prepared.message };
}

function formatCheckpointProgressEvent(event: TextRepairProgressEvent): string {
	switch (event.type) {
		case "attempt_started":
			return event.attempt === 1
				? "\u2022 Generating checkpoint message with model\u2026"
				: `  \u2026 regenerating checkpoint message (attempt ${event.attempt}/${event.maxAttempts})`;
		case "attempt_waiting":
			return `  \u2026 still generating checkpoint message (${formatElapsedMs(event.elapsedMs)} elapsed)`;
		case "attempt_invalid":
			return "  \u2026 checkpoint message draft failed validation; requesting repair";
	}
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
