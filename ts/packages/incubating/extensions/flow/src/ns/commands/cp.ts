import type { TimeServices } from "@nseng-ai/foundation/time";
import type { NsProgressPhaseListener } from "@nseng-ai/sdk";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { TextGenerator } from "@nseng-ai/extension-kit/text-generation";
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
	formatGitTrunkMissingError,
	formatGitTrunkResolutionError,
	runCheckpointWorkflow,
	type CheckpointGateway,
	type CheckpointWorkflowResult,
} from "../../checkpoint/checkpoint.ts";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { createFlowModelWarningPresenter, resolveFlowModelSelection } from "../model-policy.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

const cpResultSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("dry-run"), branch: z.string(), message: z.string() }),
	z.object({ type: z.literal("committed"), summary: z.string(), message: z.string() }),
]);

const cpRequestSchema = z.object({
	dryRun: z
		.boolean()
		.default(false)
		.describe("Preview the checkpoint message without staging or committing."),
	force: z
		.boolean()
		.default(false)
		.describe("Allow creating a checkpoint commit on the configured Git trunk branch."),
});

type CpRequest = z.output<typeof cpRequestSchema>;

export const flowCpCommand: NsCommand<typeof cpRequestSchema> = defineCommand({
	schema: cpRequestSchema,
	resultSchema: cpResultSchema,
	options: { dryRun: { short: "-n" }, force: { short: "-f" } },
	renderHuman: (result) =>
		result.type === "dry-run"
			? formatDryRunMessage(result.branch, result.message)
			: `${result.summary}\n${result.message}`,
	handler: async (ctx, request: CpRequest) => {
		const runtime = createNsCheckpointRuntime(ctx);
		const presentModelWarning = createFlowModelWarningPresenter(ctx);
		// A dry run just previews the model-authored message; skip the live region (no commit phase runs).
		if (request.dryRun) {
			const model = await resolveFlowModelSelection(
				ctx,
				MODEL_OPERATION_IDS.flowCheckpoint,
				presentModelWarning,
			);
			if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
			const result = await runCpCore({
				cwd: ctx.cwd,
				env: ctx.env,
				textGenerator: ctx.textGenerator,
				modelSelection: model.modelSelection,
				isDryRun: true,
				allowTrunk: request.force,
				checkpointGateway: runtime.checkpointGateway,
				git: runtime.git,
			});
			return toCommandResult(result);
		}

		const model = await resolveFlowModelSelection(
			ctx,
			MODEL_OPERATION_IDS.flowCheckpoint,
			presentModelWarning,
		);
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
					allowTrunk: request.force,
					checkpointGateway: runtime.checkpointGateway,
					git: runtime.git,
					onPhase: stream.emit,
				});
				const command = toCommandResult(result);
				return { result: command, isFailed: command.status !== "success" };
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
	allowTrunk: boolean;
	checkpointGateway: CheckpointGateway;
	git: Pick<GitGateway, "cachedOriginHeadBranch">;
	onPhase?: NsProgressPhaseListener;
	time?: TimeServices;
}

export async function runCpCore(options: RunCpCoreOptions): Promise<RunCpCoreResult> {
	return runCheckpointWorkflow({
		cwd: options.cwd,
		env: options.env,
		gateway: options.checkpointGateway,
		git: options.git,
		textGenerator: options.textGenerator,
		modelSelection: options.modelSelection,
		dryRun: options.isDryRun,
		allowTrunk: options.allowTrunk,
		...(options.onPhase === undefined ? {} : { onPhase: options.onPhase }),
		...(options.time === undefined ? {} : { time: options.time }),
	});
}

function toCommandResult(result: RunCpCoreResult) {
	switch (result.type) {
		case "snapshot-failed":
			return failure(FLOW_COMMAND_FAILED, formatPendingWorktreeError(result.error));
		case "trunk-missing":
			return failure(FLOW_COMMAND_FAILED, formatGitTrunkMissingError());
		case "trunk-resolution-failed":
			return failure(FLOW_COMMAND_FAILED, formatGitTrunkResolutionError(result.error));
		case "trunk":
			return negative(`Refusing to create checkpoint commit on trunk branch: ${result.branch}`);
		case "clean":
			return negative("Working tree is clean; nothing to checkpoint.");
		case "message-failed":
			return failure(FLOW_COMMAND_FAILED, result.error);
		case "dry-run":
			return ok({ type: "dry-run" as const, branch: result.branch, message: result.message });
		case "commit-failed":
			return failure(FLOW_COMMAND_FAILED, result.error);
		case "committed":
			return ok({ type: "committed" as const, summary: result.summary, message: result.message });
	}
}

function formatDryRunMessage(branch: string, message: string): string {
	return `Dry run: would create checkpoint commit on ${branch}\n\n${message}`;
}
