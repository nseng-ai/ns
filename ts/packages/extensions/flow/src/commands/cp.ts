import { createSdlCommandRunner } from "@sdl/extension-kit/command-runner";
import { defineExtension, failed, ok, z, type SdlCommand } from "@sdl/sdl/sdk";
import type { TextGenerator } from "@sdl/sdl/text-generation";

import { prepareFlowCheckpointMessage } from "../shared/model-generation.ts";
import {
	CHECKPOINT_MODEL_ENV,
	DEFAULT_CHECKPOINT_MODEL_REF,
	LEGACY_CHECKPOINT_MODEL_ENV,
} from "../shared/text-generation.ts";
import { formatPendingWorktreeError, type PendingWorktreeError } from "../shared/worktree.ts";
import { RealCheckpointGateway, type CheckpointGateway } from "../shared/checkpoint.ts";

const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses main/master, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const cpRequestSchema = z.object({
	dryRun: z
		.boolean()
		.default(false)
		.describe("Preview the checkpoint message without staging or committing."),
});

type CpRequest = z.output<typeof cpRequestSchema>;

export const flowCpCommand: SdlCommand<typeof cpRequestSchema> = {
	name: "cp",
	summary: "Create a checkpoint commit for the current diff.",
	description: CP_COMMAND_DESCRIPTION,
	schema: cpRequestSchema,
	async run(ctx, request: CpRequest) {
		const result = await runCpCore({
			cwd: ctx.cwd,
			env: ctx.env,
			textGenerator: ctx.textGenerator,
			dryRun: request.dryRun,
			checkpointGateway: new RealCheckpointGateway(createSdlCommandRunner(ctx)),
		});
		return toCommandResult(result);
	},
};

export default defineExtension({
	commands: [flowCpCommand],
});

export type RunCpCoreResult =
	| { type: "snapshot-failed"; error: PendingWorktreeError }
	| { type: "trunk"; branch: string }
	| { type: "clean" }
	| { type: "message-failed"; error: string }
	| { type: "dry-run"; branch: string; message: string }
	| { type: "commit-failed"; error: string }
	| { type: "committed"; summary: string; message: string };

export interface RunCpCoreOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	textGenerator: TextGenerator;
	dryRun: boolean;
	checkpointGateway: CheckpointGateway;
}

export async function runCpCore(options: RunCpCoreOptions): Promise<RunCpCoreResult> {
	const loaded = await options.checkpointGateway.loadPendingWorktreeSnapshot({ cwd: options.cwd });
	if (!loaded.ok) return { type: "snapshot-failed", error: loaded.error };

	const snapshot = loaded.snapshot;
	if (snapshot.branch === "main" || snapshot.branch === "master") {
		return { type: "trunk", branch: snapshot.branch };
	}
	if (snapshot.clean) return { type: "clean" };

	const prepared = await prepareFlowCheckpointMessage(
		{ env: options.env, textGenerator: options.textGenerator },
		snapshot,
	);
	if (!prepared.ok) return { type: "message-failed", error: prepared.error };

	if (options.dryRun) {
		return { type: "dry-run", branch: snapshot.branch, message: prepared.message };
	}

	const committed = await options.checkpointGateway.createCommitWithPreparedMessage({
		cwd: options.cwd,
		message: prepared.message,
	});
	if ("error" in committed) return { type: "commit-failed", error: committed.error };

	return { type: "committed", summary: committed.summary, message: prepared.message };
}

function toCommandResult(result: RunCpCoreResult) {
	switch (result.type) {
		case "snapshot-failed":
			return failed(formatPendingWorktreeError(result.error), 2);
		case "trunk":
			return failed(`Refusing to create checkpoint commit on trunk branch: ${result.branch}`, 1);
		case "clean":
			return failed("Working tree is clean; nothing to checkpoint.", 1);
		case "message-failed":
			return failed(result.error, 2);
		case "dry-run":
			return ok(formatDryRunMessage(result.branch, result.message));
		case "commit-failed":
			return failed(result.error, 2);
		case "committed":
			return ok(`${result.summary}\n${result.message}`);
	}
}

function formatDryRunMessage(branch: string, message: string): string {
	return `Dry run: would create checkpoint commit on ${branch}\n\n${message}`;
}
