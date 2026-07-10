import type { Clock } from "@nseng-ai/foundation/clock";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";
import type { NsProgressPhaseListener } from "@nseng-ai/kernel/sdk";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import { defineCommand, failure, negative, ok, z, type NsCommand } from "@nseng-ai/kernel/sdk";
import {
	CP_PHASES,
	flowStreamDeps,
	resolveFlowStreamCaps,
	runSettledPhaseStream,
} from "../../phase-stream/phase-stream.ts";
import {
	CHECKPOINT_MODEL_ENV,
	DEFAULT_CHECKPOINT_MODEL_REF,
	LEGACY_CHECKPOINT_MODEL_ENV,
} from "@nseng-ai/capability-kit/text-generation";
import { formatPendingWorktreeError } from "../../autobranch/pending-worktree-format.ts";
import {
	createNsCheckpointRuntime,
	runCheckpointWorkflow,
	type CheckpointGateway,
	type CheckpointWorkflowResult,
} from "../../checkpoint/checkpoint.ts";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";

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

export interface FlowCpCommandOptions {
	clock?: Clock;
	timers?: TimerScheduler;
}

export function createFlowCpCommand(
	options: FlowCpCommandOptions = {},
): NsCommand<typeof cpRequestSchema> {
	return defineCommand({
		name: "cp",
		summary: "Create a checkpoint commit for the current diff.",
		description: CP_COMMAND_DESCRIPTION,
		schema: cpRequestSchema,
		resultSchema: z.string(),
		options: { dryRun: { short: "-n" } },
		handler: async (ctx, request: CpRequest) => {
			const runtime = createNsCheckpointRuntime(ctx);
			// A dry run just previews the model-authored message; skip the live region (no commit phase runs).
			if (request.dryRun) {
				const result = await runCpCore({
					cwd: ctx.cwd,
					env: ctx.env,
					textGenerator: ctx.textGenerator,
					isDryRun: true,
					checkpointGateway: runtime.checkpointGateway,
					...(options.clock === undefined ? {} : { clock: options.clock }),
					...(options.timers === undefined ? {} : { timers: options.timers }),
				});
				return toCommandResult(result);
			}

			const caps = resolveFlowStreamCaps(ctx);
			return await runSettledPhaseStream({
				caps,
				specs: CP_PHASES,
				deps: flowStreamDeps(ctx, caps),
				forward: ctx.progress,
				title: "ns flow cp",
				body: async (stream) => {
					const result = await runCpCore({
						cwd: ctx.cwd,
						env: ctx.env,
						textGenerator: ctx.textGenerator,
						isDryRun: false,
						checkpointGateway: runtime.checkpointGateway,
						onPhase: stream.emit,
						...(options.clock === undefined ? {} : { clock: options.clock }),
						...(options.timers === undefined ? {} : { timers: options.timers }),
					});
					const command = toCommandResult(result);
					return { result: command, isFailed: command.type !== "ok" };
				},
			});
		},
	});
}

export const flowCpCommand = createFlowCpCommand();

export default flowCpCommand;

export type RunCpCoreResult = CheckpointWorkflowResult;

export interface RunCpCoreOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	textGenerator: TextGenerator;
	isDryRun: boolean;
	checkpointGateway: CheckpointGateway;
	onPhase?: NsProgressPhaseListener;
	clock?: Clock;
	timers?: TimerScheduler;
}

export async function runCpCore(options: RunCpCoreOptions): Promise<RunCpCoreResult> {
	return runCheckpointWorkflow({
		cwd: options.cwd,
		env: options.env,
		gateway: options.checkpointGateway,
		textGenerator: options.textGenerator,
		dryRun: options.isDryRun,
		...(options.onPhase === undefined ? {} : { onPhase: options.onPhase }),
		...(options.clock === undefined ? {} : { clock: options.clock }),
		...(options.timers === undefined ? {} : { timers: options.timers }),
	});
}

function toCommandResult(result: RunCpCoreResult) {
	switch (result.type) {
		case "snapshot-failed":
			return failure(FLOW_COMMAND_FAILED, formatPendingWorktreeError(result.error));
		case "trunk":
			return negative(`Refusing to create checkpoint commit on trunk branch: ${result.branch}`);
		case "clean":
			return negative("Working tree is clean; nothing to checkpoint.");
		case "message-failed":
			return failure(FLOW_COMMAND_FAILED, result.error);
		case "dry-run":
			return ok(formatDryRunMessage(result.branch, result.message));
		case "commit-failed":
			return failure(FLOW_COMMAND_FAILED, result.error);
		case "committed":
			return ok(`${result.summary}\n${result.message}`);
	}
}

function formatDryRunMessage(branch: string, message: string): string {
	return `Dry run: would create checkpoint commit on ${branch}\n\n${message}`;
}
