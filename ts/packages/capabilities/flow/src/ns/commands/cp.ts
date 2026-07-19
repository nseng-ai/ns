import type { TimeServices } from "@nseng-ai/foundation/time";
import type { NsProgressPhaseListener } from "@nseng-ai/sdk";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import { defineCommand, failure, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";
import {
	CP_PHASES,
	flowStreamDeps,
	resolveFlowStreamCaps,
	runSettledPhaseStream,
} from "../../phase-stream/phase-stream.ts";
import { formatPendingWorktreeError } from "../../autobranch/pending-worktree-format.ts";
import {
	createNsCheckpointRuntime,
	formatGraphiteTrunkResolutionError,
	runCheckpointWorkflow,
	type CheckpointGateway,
	type CheckpointWorkflowResult,
} from "../../checkpoint/checkpoint.ts";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import { resolveFlowModelSelection } from "../model-policy.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses Graphite's configured trunk branch, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message. Checkpoint safety requires a successful configured-trunk lookup from Graphite.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.
`;

const cpRequestSchema = z.object({
	dryRun: z
		.boolean()
		.default(false)
		.describe("Preview the checkpoint message without staging or committing."),
});

type CpRequest = z.output<typeof cpRequestSchema>;

export const flowCpCommand: NsCommand<typeof cpRequestSchema> = defineCommand({
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
			const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowCheckpoint);
			if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
			const result = await runCpCore({
				cwd: ctx.cwd,
				env: ctx.env,
				textGenerator: ctx.textGenerator,
				modelSelection: model.modelSelection,
				isDryRun: true,
				checkpointGateway: runtime.checkpointGateway,
				graphite: runtime.graphite,
			});
			return toCommandResult(result);
		}

		const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowCheckpoint);
		if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
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
					modelSelection: model.modelSelection,
					isDryRun: false,
					checkpointGateway: runtime.checkpointGateway,
					graphite: runtime.graphite,
					onPhase: stream.emit,
				});
				const command = toCommandResult(result);
				return { result: command, isFailed: command.type !== "ok" };
			},
		});
	},
});

export default flowCpCommand;

export type RunCpCoreResult = CheckpointWorkflowResult;

export interface RunCpCoreOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	textGenerator: TextGenerator;
	modelSelection: ModelSelection;
	isDryRun: boolean;
	checkpointGateway: CheckpointGateway;
	graphite: Pick<GraphiteBranchGateway, "trunkBranch">;
	onPhase?: NsProgressPhaseListener;
	time?: TimeServices;
}

export async function runCpCore(options: RunCpCoreOptions): Promise<RunCpCoreResult> {
	return runCheckpointWorkflow({
		cwd: options.cwd,
		env: options.env,
		gateway: options.checkpointGateway,
		graphite: options.graphite,
		textGenerator: options.textGenerator,
		modelSelection: options.modelSelection,
		dryRun: options.isDryRun,
		...(options.onPhase === undefined ? {} : { onPhase: options.onPhase }),
		...(options.time === undefined ? {} : { time: options.time }),
	});
}

function toCommandResult(result: RunCpCoreResult) {
	switch (result.type) {
		case "snapshot-failed":
			return failure(FLOW_COMMAND_FAILED, formatPendingWorktreeError(result.error));
		case "trunk-resolution-failed":
			return failure(FLOW_COMMAND_FAILED, formatGraphiteTrunkResolutionError(result.error));
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
