import { formatCommand } from "@sdl/core/exec";
import { collectSubmitRestackRequirements } from "../land/api.ts";
import { execGraphite } from "./command-exec.ts";
import { GT_MUTATION_TIMEOUT_MS } from "./constants.ts";
import { completed, failure, landStackFailure, type LandStackOutcome } from "./errors.ts";
import {
	confirmPreMergeMaintenance,
	optionalField,
	type PreMergeMaintenanceOptions,
} from "./pre-merge-confirmation.ts";
import {
	restackForSubmitArgs,
	restackTargetForSubmit,
	submitUpdateArgs,
} from "./graphite-command-args.ts";
import { createLandContext } from "./land-context-adapter.ts";
import { toLandStackFailure } from "./plan-mapping.ts";
import { formatPrSubmitRequirement } from "./pr-facts.ts";
import { setStatus } from "./presentation.ts";
import type { LandingPlan, PrSubmitRequirement, RestackRequirement } from "./types.ts";

export async function confirmAndSubmitRequiredPrUpdates(
	options: PreMergeMaintenanceOptions,
): Promise<LandStackOutcome> {
	const { pi, ctx, plan } = options;
	const submitArgs = submitUpdateArgs(plan.stack.landingTargetBranch);
	const restackTarget = restackTargetForSubmit(plan);
	const details = formatSubmitUpdateDetails(plan);
	const commandLines = restackTarget
		? [formatCommand("gt", restackForSubmitArgs(restackTarget)), formatCommand("gt", submitArgs)]
		: [formatCommand("gt", submitArgs)];
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
		const restackArgs = restackForSubmitArgs(restackTarget);
		setStatus(ctx, `restacking ${restackTarget}...`);
		const restacked = await execGraphite(pi, {
			args: restackArgs,
			cwd: plan.repoRoot,
			timeoutMs: GT_MUTATION_TIMEOUT_MS,
		});
		if (restacked.code !== 0) {
			return failure(
				landStackFailure("gt restack failed before any PRs were landed.", {
					commandDisplay: formatCommand("gt", restackArgs),
					result: restacked,
					suggestedAction: `Resolve the restack failure, run ${formatCommand("gt", restackArgs)} and ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /sdl:flow:land.`,
				}),
			);
		}

		setStatus(ctx, "verifying restack...");
		const remainingRestack = await collectSubmitRestackRequirements(
			createLandContext(pi),
			plan.repoRoot,
			{
				...plan.stack,
				warnings: plan.stack.warnings.map((message) => ({ level: "warning", message })),
			},
		);
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
	const result = await execGraphite(pi, {
		args: submitArgs,
		cwd: plan.repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure("gt submit/update failed before any PRs were landed.", {
				commandDisplay: formatCommand("gt", submitArgs),
				result,
				suggestedAction: `Resolve the submit failure, run ${formatCommand("gt", submitArgs)} manually if appropriate, then rerun /sdl:flow:land.`,
			}),
		);
	}
	return completed();
}

export function formatSubmitUpdateDetails(plan: LandingPlan): string {
	const submitArgs = submitUpdateArgs(plan.stack.landingTargetBranch);
	const restackTarget = restackTargetForSubmit(plan);
	const commands = restackTarget
		? [formatCommand("gt", restackForSubmitArgs(restackTarget)), formatCommand("gt", submitArgs)]
		: [formatCommand("gt", submitArgs)];
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
