import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { TimeServices } from "@nseng-ai/foundation/time";
import { failure, negative, ok, type NsProgressPhaseListener } from "@nseng-ai/sdk";
import type { NsClinkrCommandBundle } from "@nseng-ai/sdk/command";

import { formatPendingWorktreeError } from "../../../autobranch/pending-worktree-format.ts";
import {
	createCheckpointRuntime,
	formatGraphiteTrunkResolutionError,
	runCheckpointWorkflow,
	type CheckpointGateway,
	type CheckpointWorkflowResult,
} from "../../../checkpoint/checkpoint.ts";
import { CP_PHASES } from "../../../phase-stream/phase-stream.ts";
import { progressPhaseInfos } from "../../../phase-stream/phase-stream-specs.ts";
import { FLOW_COMMAND_FAILED } from "../../flow-cli-runner.ts";
import type { FlowCommandContext } from "../../context.ts";
import { resolveFlowModelSelectionAt } from "../../model-policy.ts";

export async function runCpCommand(
	context: FlowCommandContext,
	bundle: NsClinkrCommandBundle,
	request: { dryRun: boolean },
) {
	const runtime = createCheckpointRuntime({
		runner: context.commandRunner,
		git: context.git,
		graphite: context.graphiteBranch,
	});
	const model = await resolveFlowModelSelectionAt(
		{ cwd: bundle.cwd, git: context.git },
		MODEL_OPERATION_IDS.flowCheckpoint,
	);
	if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
	if (!request.dryRun) {
		bundle.events.emit({
			type: "phases-declared",
			title: "ns flow cp",
			phases: progressPhaseInfos(CP_PHASES),
		});
	}
	return toCommandResult(
		await runCheckpointWorkflow({
			cwd: bundle.cwd,
			textGenerator: context.textGenerator,
			modelSelection: model.modelSelection,
			dryRun: request.dryRun,
			gateway: runtime.checkpointGateway,
			graphite: runtime.graphite,
			...(request.dryRun ? {} : { onPhase: bundle.events.emit }),
		}),
	);
}

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

export async function runCpCore(options: RunCpCoreOptions): Promise<CheckpointWorkflowResult> {
	return runCheckpointWorkflow({
		cwd: options.cwd,
		textGenerator: options.textGenerator,
		modelSelection: options.modelSelection,
		dryRun: options.isDryRun,
		gateway: options.checkpointGateway,
		graphite: options.graphite,
		...(options.onPhase === undefined ? {} : { onPhase: options.onPhase }),
		...(options.time === undefined ? {} : { time: options.time }),
	});
}

function toCommandResult(result: CheckpointWorkflowResult) {
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
