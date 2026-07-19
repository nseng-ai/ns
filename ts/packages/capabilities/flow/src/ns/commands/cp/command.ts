import type { TimeServices } from "@nseng-ai/foundation/time";
import type { NsProgressPhaseListener } from "@nseng-ai/sdk";
import { clinkr, defineCommand, type ClinkrHandlerBundle } from "@nseng-ai/sdk/command";
import { failure, negative, ok, z } from "@nseng-ai/sdk";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import type { FirstPartyCommandContext } from "@nseng-ai/capability-kit";
import { MODEL_OPERATION_IDS } from "@nseng-ai/capability-kit/model-policy";
import { resolveRenderCapabilities } from "@nseng-ai/clinkr";
import {
	CP_PHASES,
	flowStreamDeps,
	runSettledPhaseStream,
} from "../../../phase-stream/phase-stream.ts";
import { formatPendingWorktreeError } from "../../../autobranch/pending-worktree-format.ts";
import {
	createCheckpointRuntime,
	formatGraphiteTrunkResolutionError,
	runCheckpointWorkflow,
	type CheckpointGateway,
	type CheckpointWorkflowResult,
} from "../../../checkpoint/checkpoint.ts";
import { FLOW_COMMAND_FAILED } from "../../flow-cli-runner.ts";
import { resolveFlowModelSelectionAt } from "../../model-policy.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

export const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

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

const cpRun = clinkr<FirstPartyCommandContext, typeof cpRequestSchema, string>({
	schema: cpRequestSchema,
	resultSchema: z.string(),
	options: { dryRun: { short: "-n" } },
	handler: async (bundle, request: CpRequest) => runCpCommand(bundle, request),
});

export const flowCpCommand = defineCommand({
	name: "cp",
	summary: "Create a checkpoint commit for the current diff.",
	description: CP_COMMAND_DESCRIPTION,
	run: cpRun,
});

export default flowCpCommand;

async function runCpCommand(
	bundle: ClinkrHandlerBundle<FirstPartyCommandContext>,
	request: CpRequest,
) {
	const services = bundle.context;
	const runtime = createCheckpointRuntime({
		runner: services.commandRunner,
		git: services.git,
		graphite: services.graphiteBranch,
	});
	const model = await resolveFlowModelSelectionAt(
		{ cwd: bundle.cwd, git: services.git },
		MODEL_OPERATION_IDS.flowCheckpoint,
	);
	if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
	const run = async (onPhase?: NsProgressPhaseListener) =>
		await runCpCore({
			cwd: bundle.cwd,
			env: services.env,
			textGenerator: services.textGenerator,
			modelSelection: model.modelSelection,
			isDryRun: request.dryRun,
			checkpointGateway: runtime.checkpointGateway,
			graphite: runtime.graphite,
			...(onPhase === undefined ? {} : { onPhase }),
		});
	if (request.dryRun) return toCommandResult(await run());

	const caps = resolveRenderCapabilities(bundle.caps);
	const compatibilityContext = {
		stdout: undefined,
		stderr: undefined,
		...(bundle.onOutput === undefined ? {} : { onOutput: bundle.onOutput }),
	};
	return await runSettledPhaseStream({
		caps,
		specs: CP_PHASES,
		deps: flowStreamDeps(compatibilityContext, caps),
		forward: { isLive: bundle.events.isLive, phase: bundle.events.emit },
		title: "ns flow cp",
		body: async (stream) => {
			const command = toCommandResult(await run(stream.emit));
			return { result: command, isFailed: command.type !== "ok" };
		},
	});
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
		env: options.env,
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
