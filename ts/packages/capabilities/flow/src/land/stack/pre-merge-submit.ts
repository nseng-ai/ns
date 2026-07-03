import { collectSubmitRestackRequirements } from "../api.ts";
import type { LandContext, LandingFailure } from "../api.ts";
import { completed, failure, landStackFailure, type LandStackOutcome } from "./errors.ts";
import {
	confirmPreMergeMaintenance,
	optionalField,
	type PreMergeMaintenanceOptions,
} from "./pre-merge-confirmation.ts";
import { formatGraphiteOperation, restackTargetForSubmit } from "./graphite-command-channel.ts";
import { formatPrSubmitRequirement, toLandStackFailure } from "./landing-plan.ts";
import { setStatus } from "./presentation.ts";
import type { FlowLandingPlan, PrSubmitRequirement, RestackRequirement } from "./types.ts";

export interface PreMergeSubmitMaintenanceOptions extends PreMergeMaintenanceOptions {
	readonly landContext: LandContext;
}

export async function confirmAndSubmitRequiredPrUpdates(
	options: PreMergeSubmitMaintenanceOptions,
): Promise<LandStackOutcome> {
	const { ctx, landContext, plan } = options;
	const submitOperation = {
		kind: "submit-update",
		branch: plan.stack.landingTargetBranch,
	} as const;
	const restackTarget = restackTargetForSubmit(plan);
	const details = formatSubmitUpdateDetails(plan);
	const commandLines = restackTarget
		? [
				formatGraphiteOperation({ kind: "restack-upstack", branch: restackTarget }),
				formatGraphiteOperation(submitOperation),
			]
		: [formatGraphiteOperation(submitOperation)];
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
			`No PRs were landed. Run ${manualCommandText} manually, then rerun /sdl:flow:land --yes.`,
		].join("\n"),
		nonInteractiveFailureOptions: {
			suggestedAction: `Run ${manualCommandText} manually, then rerun /sdl:flow:land --yes.`,
		},
	});
	if (confirmationOutcome.type === "failure") return confirmationOutcome;

	if (restackTarget) {
		const restackOperation = { kind: "restack-upstack", branch: restackTarget } as const;
		setStatus(ctx, `restacking ${restackTarget}...`);
		const restacked = await landContext.graphite.prepareRestackForSubmit({
			repoRoot: plan.repoRoot,
			branch: restackTarget,
		});
		if (restacked.type === "failure") {
			return failure(
				preMergeGraphiteFailure(restacked.failure, {
					suggestedAction: `Resolve the restack failure, run ${formatGraphiteOperation(restackOperation)} and ${formatGraphiteOperation(submitOperation)} manually if appropriate, then rerun /sdl:flow:land.`,
				}),
			);
		}

		setStatus(ctx, "verifying restack...");
		const remainingRestack = await collectSubmitRestackRequirements(landContext, plan.repoRoot, {
			...plan.stack,
			warnings: plan.stack.warnings.map((message) => ({ level: "warning" as const, message })),
		});
		if (remainingRestack.type === "failure") {
			return failure(toLandStackFailure(remainingRestack.failure));
		}
		if (remainingRestack.value.length > 0) {
			return failure(
				landStackFailure(formatRemainingSubmitRestackRequirements(remainingRestack.value), {
					suggestedAction:
						"Free or detach the holding worktrees, restack the stack, then rerun /sdl:flow:land.",
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
				suggestedAction: `Resolve the submit failure, run ${formatGraphiteOperation(submitOperation)} manually if appropriate, then rerun /sdl:flow:land.`,
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

export function formatSubmitUpdateDetails(plan: FlowLandingPlan): string {
	const submitOperation = {
		kind: "submit-update",
		branch: plan.stack.landingTargetBranch,
	} as const;
	const restackTarget = restackTargetForSubmit(plan);
	const commands = restackTarget
		? [
				formatGraphiteOperation({ kind: "restack-upstack", branch: restackTarget }),
				formatGraphiteOperation(submitOperation),
			]
		: [formatGraphiteOperation(submitOperation)];
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

export function formatRemainingSubmitRequirements(requirements: PrSubmitRequirement[]): string {
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
