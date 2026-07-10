import { collectSubmitRestackRequirements } from "../api.ts";
import type {
	LandContext,
	LandingFailure,
	LandingPlan,
	PrSubmitRequirement,
	RestackRequirement,
} from "../api.ts";
import { completed, failure, landStackFailure, type LandStackOutcome } from "./errors.ts";
import {
	confirmPreMergeMaintenance,
	optionalField,
	type PreMergeConfirmation,
} from "./pre-merge-confirmation.ts";
import {
	formatGraphiteOperation,
	formatSubmitUpdateCommandLines,
	restackOperation,
	restackTargetForSubmit,
	submitUpdateOperation,
} from "./graphite-command-channel.ts";
import { formatPrSubmitRequirement } from "./landing-plan.ts";
import { setStatus } from "../land-presentation.ts";
import type { LandStackCommandContext } from "./types.ts";

export interface PreMergeSubmitMaintenanceOptions {
	readonly ctx: LandStackCommandContext;
	readonly plan: LandingPlan;
	readonly landContext: LandContext;
	readonly confirmation?: PreMergeConfirmation;
}

export async function confirmAndSubmitRequiredPrUpdates(
	options: PreMergeSubmitMaintenanceOptions,
): Promise<LandStackOutcome> {
	const { ctx, landContext, plan } = options;
	const submitOperation = submitUpdateOperation({ branch: plan.stack.landingTargetBranch });
	const restackTarget = restackTargetForSubmit(plan);
	const details = formatSubmitUpdateDetails(plan);
	const commandLines = formatSubmitUpdateCommandLines(plan);
	const manualCommandText = commandLines.map((commandLine) => `\`${commandLine}\``).join(" then ");
	const actionName = restackTarget ? "restack + submit/update" : "submit/update";

	const confirmationOutcome = await confirmPreMergeMaintenance({
		ctx,
		...optionalField("confirmation", options.confirmation),
		title: restackTarget ? "Run gt restack + submit/update?" : "Run gt submit/update?",
		details,
		nonInteractiveMessage: [
			`GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required ${actionName} confirmation.`,
			details,
			`No PRs were landed. Run ${manualCommandText} manually, then rerun /ns:flow:land --yes.`,
		].join("\n"),
		nonInteractiveFailureOptions: {
			suggestedAction: `Run ${manualCommandText} manually, then rerun /ns:flow:land --yes.`,
		},
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	if (restackTarget) {
		const restackForSubmitOperation = restackOperation({
			branch: restackTarget,
			scope: "upstack",
		});
		setStatus(ctx, `restacking ${restackTarget}...`);
		const restacked = await landContext.graphite.prepareRestackForSubmit({
			repoRoot: plan.repoRoot,
			branch: restackTarget,
		});
		if (restacked.type === "failure") {
			return failure(
				preMergeGraphiteFailure(restacked.failure, {
					suggestedAction: `Resolve the restack failure, run ${formatGraphiteOperation(restackForSubmitOperation)} and ${formatGraphiteOperation(submitOperation)} manually if appropriate, then rerun /ns:flow:land.`,
				}),
			);
		}

		setStatus(ctx, "verifying restack...");
		const remainingRestack = await collectSubmitRestackRequirements(
			landContext,
			plan.repoRoot,
			plan.stack,
		);
		if (remainingRestack.type === "failure") {
			return failure(remainingRestack.failure);
		}
		if (remainingRestack.value.length > 0) {
			return failure(
				landStackFailure(formatRemainingSubmitRestackRequirements(remainingRestack.value), {
					suggestedAction:
						"Free or detach the holding worktrees, restack the stack, then rerun /ns:flow:land.",
				}),
			);
		}
	}

	setStatus(ctx, `submitting ${plan.stack.landingTargetBranch}...`);
	const result = await landContext.graphite.prepareSubmitUpdate({
		repoRoot: plan.repoRoot,
		branch: plan.stack.landingTargetBranch,
	});
	if (result.type === "failure") {
		return failure(
			preMergeGraphiteFailure(result.failure, {
				suggestedAction: `Resolve the submit failure, run ${formatGraphiteOperation(submitOperation)} manually if appropriate, then rerun /ns:flow:land.`,
			}),
		);
	}
	return completed();
}

function preMergeGraphiteFailure(
	landFailureValue: LandingFailure,
	options: { readonly suggestedAction: string },
) {
	return landStackFailure(landFailureValue.message, {
		suggestedAction: options.suggestedAction,
	});
}

export function formatSubmitUpdateDetails(plan: LandingPlan): string {
	const restackTarget = restackTargetForSubmit(plan);
	const commands = formatSubmitUpdateCommandLines(plan);
	const lines = [
		restackTarget
			? "Local branch reachability shows this stack needs restack before submit/update, and GitHub PR metadata is behind local refs. Run restack then submit/update before merging?"
			: "GitHub PR metadata is behind local Graphite refs. Run Graphite submit/update before merging?",
		"",
	];

	if (restackTarget) {
		lines.push(
			"Landing branches needing restack:",
			...plan.submitRestackRequirements.map(
				(requirement) => `- ${requirement.branch} on ${requirement.parent}`,
			),
			"",
		);
	}

	lines.push(
		"PR metadata to update:",
		...plan.prSubmitRequirements.map(formatPrSubmitRequirement),
		"",
		"Commands:",
		...commands.map((command) => `$ ${command}`),
	);
	return lines.join("\n");
}

export function formatRemainingSubmitRequirements(
	requirements: readonly PrSubmitRequirement[],
): string {
	return [
		"gt submit/update completed, but GitHub PR metadata still differs from local Graphite refs.",
		"No PRs were landed.",
		"",
		...requirements.map(formatPrSubmitRequirement),
	].join("\n");
}

function formatRemainingSubmitRestackRequirements(
	requirements: readonly RestackRequirement[],
): string {
	return [
		"gt restack completed, but these branches are still not restacked onto their parents:",
		...requirements.map((requirement) => `- ${requirement.branch} on ${requirement.parent}`),
		"",
		"gt restack exits 0 while skipping branches checked out in other worktrees.",
		"No PRs were landed; gt submit was not run.",
	].join("\n");
}
