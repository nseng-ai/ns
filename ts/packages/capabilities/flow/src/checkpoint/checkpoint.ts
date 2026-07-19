import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { runCommand } from "@nseng-ai/foundation/exec";
import {
	formatCommand,
	formatCommandDetails,
	type CommandRunner,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import type { TimeServices } from "@nseng-ai/foundation/time";
import type { ActiveOperation, NsProgressPhaseListener } from "@nseng-ai/sdk";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import { createNsCommandRunner } from "@nseng-ai/capability-kit/command-runner";
import { createNsGitGateway } from "@nseng-ai/capability-kit";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
	type GraphiteErrorInfo,
	type GraphiteTrunkBranchFailureReason,
} from "@nseng-ai/capability-kit/graphite/branch";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { TextRepairProgressEvent } from "@nseng-ai/capability-kit/text-repair";
import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type CommandResult,
} from "@nseng-ai/capability-kit/checkpoint-flow";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "@nseng-ai/capability-kit/pending-worktree";
import { type TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import {
	commandOperations,
	modelOperation,
	withActiveOperations,
} from "../phase-stream/matrix-progress-core.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import { formatModelRef } from "@nseng-ai/foundation/model-slug";

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
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
}

export function createCheckpointRuntime(options: {
	runner: CommandRunner;
	git: Pick<GitGateway, "optionalRepoRoot">;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
}): NsCheckpointRuntime {
	return {
		checkpointGateway: new RealCheckpointGateway({
			runner: options.runner,
			git: options.git,
		}),
		graphite: options.graphite,
	};
}

export function createNsCheckpointRuntime(ctx: NsExtensionApi): NsCheckpointRuntime {
	return createCheckpointRuntime({
		runner: createNsCommandRunner(ctx),
		git: createNsGitGateway(ctx),
		graphite: new RealGraphiteBranchGateway(ctx),
	});
}

export interface CheckpointRunContext {
	gateway: CheckpointGateway;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	onActiveOperations?: (operations: readonly ActiveOperation[]) => void;
}

export interface RunCheckpointCommandOptions extends CheckpointRunContext {
	cwd: string;
	env: Record<string, string | undefined>;
	textGenerator: TextGenerator;
	modelSelection: ModelSelection;
	repoRoot?: string;
	/** Typed phase sequencing for a presentation driver (inspect → generate → commit). */
	onPhase?: NsProgressPhaseListener;
	time?: TimeServices;
}

export interface RunCheckpointWorkflowOptions extends RunCheckpointCommandOptions {
	dryRun: boolean;
}

export type CheckpointWorkflowResult =
	| { type: "snapshot-failed"; error: PendingWorktreeError }
	| {
			type: "trunk-resolution-failed";
			reason: GraphiteTrunkBranchFailureReason;
			error: GraphiteErrorInfo;
	  }
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
			failurePresentation?: "deterministic";
	  };

export class RealCheckpointGateway implements CheckpointGateway {
	private readonly runner: CommandRunner;
	private readonly git: Pick<GitGateway, "optionalRepoRoot">;
	private readonly onActiveOperations:
		| ((operations: readonly ActiveOperation[]) => void)
		| undefined;

	constructor(options: {
		runner?: CommandRunner;
		git: Pick<GitGateway, "optionalRepoRoot">;
		onActiveOperations?: (operations: readonly ActiveOperation[]) => void;
	}) {
		this.runner = options.runner ?? runCommand;
		this.git = options.git;
		this.onActiveOperations = options.onActiveOperations;
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
			git: this.git,
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
		return withActiveOperations(
			this.onActiveOperations,
			commandOperations([formatCommand(command, args)]),
			async () => {
				const result = await this.runner(command, args, { cwd, timeout });
				return toCheckpointCommandResult(result);
			},
		);
	}
}

export async function runCheckpointIfPending(
	options: RunCheckpointCommandOptions,
): Promise<CheckpointIfPendingResult> {
	const result = await runCheckpointWorkflow({ ...options, dryRun: false });
	switch (result.type) {
		case "snapshot-failed":
			return { kind: "failed", output: failure(2, formatCheckpointSnapshotError(result.error)) };
		case "trunk-resolution-failed":
			return {
				kind: "failed",
				output: failure(2, formatGraphiteTrunkResolutionError(result.error)),
				failurePresentation: "deterministic",
			};
		case "clean":
			return { kind: "clean" };
		case "trunk":
			return {
				kind: "failed",
				output: failure(
					1,
					`Refusing to create checkpoint commit on trunk branch: ${result.branch}`,
				),
				failurePresentation: "deterministic",
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
	const trunk = await options.graphite.trunkBranch({ cwd: options.cwd });
	if (!trunk.ok) {
		return { type: "trunk-resolution-failed", reason: trunk.reason, error: trunk.error };
	}
	if (snapshot.branch === trunk.branch) {
		return { type: "trunk", branch: snapshot.branch };
	}
	if (snapshot.clean) return { type: "clean" };

	onPhase?.({ type: "phase-started", phaseKey: "generate" });
	const modelSelection = options.modelSelection;
	const prepared = await withActiveOperations(
		options.onActiveOperations,
		[modelOperation("generating checkpoint message", formatModelRef(modelSelection))],
		() =>
			prepareCheckpointMessage({
				status: snapshot.status,
				diff: snapshot.diff,
				textGenerator: options.textGenerator,
				modelSelection,
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
				...(options.time === undefined ? {} : { time: options.time }),
			}),
	);
	if (!prepared.ok) return { type: "message-failed", error: prepared.error };

	if (options.dryRun) {
		return { type: "dry-run", branch: snapshot.branch, message: prepared.message };
	}

	onPhase?.({ type: "phase-started", phaseKey: "commit" });
	const committed = await options.gateway.createCommitWithPreparedMessage({
		cwd: options.cwd,
		message: prepared.message,
	});
	if ("error" in committed) {
		return {
			type: "commit-failed",
			error: committed.error.replace(/\bexit code (\d+)/u, "exit $1"),
		};
	}

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

export function formatGraphiteTrunkResolutionError(error: GraphiteErrorInfo): string {
	return `Could not resolve configured Graphite trunk; checkpoint was not created.\n${error.message}`;
}

export function formatCheckpointSnapshotError(error: PendingWorktreeError): string {
	const details = formatCommandDetails(error.result);
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
	return result;
}

function failure(exitCode: number, error: string): CheckpointCommandResult {
	return {
		exitCode,
		stdout: "",
		stderr: error.endsWith("\n") ? error : `${error}\n`,
	};
}
