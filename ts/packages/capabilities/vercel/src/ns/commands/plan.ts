// `ns dispatch plan <plan-ref>` — deliver one explicit Saved Plan through
// Branch Memory, then run it on the existing Vercel dispatch spine. Tier 1:
// the scoped dispatch mutations are the command's purpose and all ordinary
// refusals happen before the workflow starts.
import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import { failure, negative, ok, z, type CommandExit, type NsCommand } from "@nseng-ai/sdk";

import { DISPATCH_CONTEXT_NAMESPACE } from "../../dispatch/dispatch-context.ts";
import {
	createDispatchPlanContext,
	type DispatchPlanCliContext,
} from "../../dispatch-client/context.ts";
import {
	executeDispatchPlan,
	type DispatchPlanOutcome,
} from "../../dispatch-client/dispatch-plan/execute.ts";
import type { DispatchPreflightCheck } from "../../dispatch-client/prompt-core.ts";

const dirtyPathsDataMaxPaths = 100;

const instructionLocatorSchema = z.object({
	namespace: z.literal(DISPATCH_CONTEXT_NAMESPACE),
	dispatchId: z.string(),
	key: z.string(),
	sourceBranch: z.string(),
	snapshotRef: z.string(),
	snapshotCommitSha: z.string(),
	entryLocator: z.string(),
});

const dispatchPlanRequestSchema = z.object({
	planRef: z.string().min(1).describe("Explicit path or reference to the Saved Plan to execute."),
});

const dispatchPlanResultSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("dispatched"),
		dispatchId: z.string(),
		revision: z.string(),
		sourceBranch: z.string(),
		isSourcePushed: z.boolean(),
		instructionLocator: instructionLocatorSchema,
		attachedPlan: z.object({
			type: z.enum(["created", "reused"]),
			namespace: z.literal("branch-context"),
			branch: z.string(),
			key: z.string(),
			snapshotRef: z.string(),
			entryLocator: z.string(),
			commit: z.string(),
			sourceFile: z.string(),
		}),
		anchorBranch: z.string(),
		anchorPrNumber: z.number().int(),
		anchorPrUrl: z.string(),
		runId: z.string(),
		workflowRunUrl: z.string(),
	}),
	z.object({
		status: z.literal("dirty-tree"),
		dirtyPaths: z.array(z.string()),
		totalDirtyPaths: z.number().int(),
	}),
]);

type DispatchPlanCommandResult = z.infer<typeof dispatchPlanResultSchema>;
type DispatchPlanSuccess = Extract<DispatchPlanCommandResult, { status: "dispatched" }>;

export const dispatchPlanCommand: NsCommand = createNsDomainCommand({
	name: "plan",
	summary: "Dispatch a Saved Plan to run remotely against your branch head.",
	description:
		"Resolve one explicit Saved Plan, attach it to the anchor branch, publish generic instructions through Branch Memory, and start the dispatch workflow with locator-only provenance. Requires a clean worktree and configured Branch Memory synchronization (`brmem setup-git`). Results land on the anchor pull request.",
	schema: dispatchPlanRequestSchema,
	resultSchema: dispatchPlanResultSchema,
	positionals: { planRef: { position: 0 } },
	createContext: createDispatchPlanContext,
	handler: runDispatchPlanCommand,
});

export default dispatchPlanCommand;

async function runDispatchPlanCommand(
	ctx: DispatchPlanCliContext,
	request: z.output<typeof dispatchPlanRequestSchema>,
): Promise<CommandExit<DispatchPlanCommandResult>> {
	let outcome: DispatchPlanOutcome;
	try {
		outcome = await executeDispatchPlan(
			{ cwd: ctx.cwd, planRef: request.planRef, onPhase: ctx.commandIo.phase },
			ctx.gateways,
		);
	} finally {
		ctx.commandIo.clearPhase();
	}

	switch (outcome.status) {
		case "dispatched": {
			const result: DispatchPlanSuccess = {
				status: "dispatched",
				dispatchId: outcome.dispatchId,
				revision: outcome.revision,
				sourceBranch: outcome.sourceBranch,
				isSourcePushed: outcome.isSourcePushed,
				instructionLocator: outcome.locator,
				attachedPlan: outcome.attachedPlan,
				anchorBranch: outcome.anchorPr.branch,
				anchorPrNumber: outcome.anchorPr.number,
				anchorPrUrl: outcome.anchorPr.url,
				runId: outcome.runId,
				workflowRunUrl: outcome.workflowRunUrl,
			};
			return ok(result, { human: renderDispatchPlanResult(result) });
		}
		case "dirty-tree":
			return negative("Dispatch refused: the worktree has uncommitted changes.", {
				data: {
					status: "dirty-tree",
					dirtyPaths: outcome.dirtyPaths.slice(0, dirtyPathsDataMaxPaths),
					totalDirtyPaths: outcome.dirtyPaths.length,
				},
			});
		case "plan-resolution-failed":
			return failure(`plan-${outcome.reason}`, outcome.message, { planRef: request.planRef });
		case "invalid-dispatch-context":
			return failure("invalid-dispatch-context", outcome.message, {
				dispatchId: outcome.dispatchId,
			});
		case "attached-plan-conflict":
			return failure(
				outcome.status,
				"An Attached Plan with different content already exists on the anchor branch.",
				{
					dispatchId: outcome.dispatchId,
					branch: outcome.branch,
					key: outcome.key,
					anchorPrUrl: outcome.anchorPr.url,
				},
			);
		case "attached-plan-publication-failed":
			return failure(outcome.status, outcome.message, {
				dispatchId: outcome.dispatchId,
				attachedPlan: outcome.attachedPlan,
				anchorBranch: outcome.anchorPr.branch,
				anchorPrNumber: outcome.anchorPr.number,
				anchorPrUrl: outcome.anchorPr.url,
			});
		case "setup-required":
			return failure("branch-memory-setup-required", outcome.message, {
				dispatchId: outcome.dispatchId,
				remote: outcome.remote,
				setupCommand: outcome.setupCommand,
				artifacts: outcome.artifacts,
			});
		case "preflight-failed":
			return failure("preflight-failed", renderPreflightFailure(outcome.checks), {
				checks: outcome.checks,
			});
		case "brmem-preflight-failed":
			return failure("branch-memory-preflight-failed", outcome.message, {
				dispatchId: outcome.dispatchId,
				remote: outcome.remote,
				artifacts: outcome.artifacts,
			});
		case "entry-creation-failed":
		case "snapshot-publication-failed":
		case "remote-verification-failed":
			return failure(outcome.status, outcome.error.message, {
				dispatchId: outcome.dispatchId,
				code: outcome.error.code,
				artifacts: outcome.artifacts,
			});
		case "remote-snapshot-mismatch":
			return failure(
				outcome.status,
				"The published Snapshot Ref did not resolve to the created Entry commit.",
				{
					dispatchId: outcome.dispatchId,
					expectedCommitSha: outcome.expectedCommitSha,
					actualCommitSha: outcome.actualCommitSha,
					artifacts: outcome.artifacts,
				},
			);
		case "source-unusable":
			return failure(outcome.code, outcome.message);
		case "source-push-failed":
		case "source-publication-plan-failed":
		case "graphite-publication-failed":
		case "source-publication-verification-failed":
		case "source-revalidation-failed":
		case "anchor-branch-availability-failed":
		case "anchor-branch-unavailable":
			return failure(
				outcome.status,
				outcome.message,
				outcome.sourceBranch === undefined ? {} : { sourceBranch: outcome.sourceBranch },
			);
		case "source-publication-force-required":
		case "source-publication-declined":
			return failure(outcome.status, outcome.message, {
				affectedBranches: outcome.affectedBranches,
			});
		case "anchor-push-failed":
		case "anchor-pr-failed":
			return failure(outcome.status, postDeliveryMessage(outcome.message, outcome.dispatchId), {
				dispatchId: outcome.dispatchId,
				artifacts: outcome.artifacts,
				anchorBranch: outcome.anchorBranch,
			});
		case "trigger-failed":
			return failure(outcome.status, postDeliveryMessage(outcome.message, outcome.dispatchId), {
				dispatchId: outcome.dispatchId,
				artifacts: outcome.artifacts,
				code: outcome.code,
				anchorBranch: outcome.anchorPr.branch,
				anchorPrNumber: outcome.anchorPr.number,
				anchorPrUrl: outcome.anchorPr.url,
			});
		case "run-id-stamp-failed":
			return failure(outcome.status, postDeliveryMessage(outcome.message, outcome.dispatchId), {
				dispatchId: outcome.dispatchId,
				artifacts: outcome.artifacts,
				anchorBranch: outcome.anchorPr.branch,
				anchorPrNumber: outcome.anchorPr.number,
				anchorPrUrl: outcome.anchorPr.url,
				...(outcome.runId === undefined ? {} : { runId: outcome.runId }),
			});
	}
}

function postDeliveryMessage(message: string, dispatchId: string): string {
	return `${message}\nDispatch ID ${dispatchId} retained its Branch Memory Entry and published Snapshot Ref.`;
}

function renderDispatchPlanResult(data: DispatchPlanSuccess): string {
	const lines = [
		"Dispatched Saved Plan. Results land on the anchor PR.",
		"",
		`  Dispatch ID: ${data.dispatchId}`,
		`  Anchor PR:    ${data.anchorPrUrl}`,
		`  Workflow run: ${data.workflowRunUrl}`,
	];
	if (data.isSourcePushed) lines.push("", `Pushed ${data.sourceBranch} first.`);
	return `${lines.join("\n")}\n`;
}

function renderPreflightFailure(checks: readonly DispatchPreflightCheck[]): string {
	return [
		"Dispatch preflight failed; nothing was delivered or started.",
		"",
		...checks.map(
			(check) => `  [${check.status === "ok" ? "ok" : "failed"}] ${check.id}: ${check.detail}`,
		),
	].join("\n");
}
