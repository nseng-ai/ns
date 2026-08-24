import { failure, negative, ok, usageError, z } from "@nseng-ai/sdk";

import type { GsBranchRef, GsGitState, GsRestackGitGateway } from "./restack-git.ts";
import {
	GS_PROVIDER_VERSION,
	type GsCommandDiagnostic,
	type GsProviderTopology,
	type GsStackProviderGateway,
} from "./stack-provider.ts";

const branchRefSchema = z.strictObject({ name: z.string(), sha: z.string() });
const recoverySchema = z.strictObject({
	action: z.enum([
		"none",
		"fix-precondition",
		"fix-provider",
		"resolve-conflicts",
		"stage-resolution",
		"inspect-state",
	]),
	instruction: z.string(),
});
const diagnosticSchema = z.strictObject({
	command: z.string(),
	termination: z.string(),
	stdout: z.string(),
	stderr: z.string(),
});

export const gsRestackRequestSchema = z.lazy(() =>
	z.strictObject({
		downstack: z.boolean().default(false),
		dryRun: z.boolean().default(false),
		yes: z.boolean().default(false),
	}),
);
export type GsRestackRequest = z.infer<typeof gsRestackRequestSchema>;

export const gsRestackResultSchema = z.lazy(() =>
	z.strictObject({
		outcome: z.enum(["dry-run", "completed", "refused", "conflict-stopped", "ambiguous"]),
		mode: z.enum(["start", "continue"]),
		requestedScope: z.enum(["full", "downstack"]),
		effectiveScope: z.enum(["full", "downstack", "provider-established"]),
		providerVersion: z.string(),
		providerTopology: z
			.strictObject({
				trunk: z.string(),
				currentBranch: z.string(),
				branches: z.array(
					z.strictObject({
						name: z.string(),
						base: z.string(),
						needsRebase: z.boolean(),
						isCurrent: z.boolean(),
					}),
				),
			})
			.nullable(),
		selectedBranches: z.array(z.string()).nullable(),
		baseAnchor: z.string().nullable(),
		git: z.strictObject({
			operation: z.enum(["none", "rebase", "merge", "cherry-pick", "revert", "bisect"]),
			clean: z.boolean(),
			unmergedPaths: z.array(z.string()),
			hasStagedChanges: z.boolean(),
			checkoutBranch: z.string().nullable(),
		}),
		occupiedBranches: z.array(z.strictObject({ branch: z.string(), path: z.string() })),
		beforeRefs: z.array(branchRefSchema),
		afterRefs: z.array(branchRefSchema),
		postconditions: z.array(z.strictObject({ name: z.string(), passed: z.boolean() })),
		recovery: recoverySchema,
		diagnostic: diagnosticSchema.nullable(),
		requiredOption: z.string().nullable(),
	}),
);
export type GsRestackResult = z.infer<typeof gsRestackResultSchema>;

export interface GsRestackContext {
	readonly provider: GsStackProviderGateway;
	readonly git: GsRestackGitGateway;
}

export interface GsRestackInvocation {
	readonly interactive: boolean;
	confirm(message: string): Promise<boolean>;
}

export async function runGsRestackResolve(
	context: GsRestackContext,
	invocation: GsRestackInvocation,
	request: GsRestackRequest,
) {
	const version = await context.provider.readVersion();
	if (!version.ok)
		return inspectionFailure(
			"Could not inspect gh-stack version.",
			emptyData(request, version.error),
		);
	const stateResult = await context.git.readState();
	if (!stateResult.ok)
		return failure("git-inspection-failed", "Could not inspect Git state.", {
			detail: stateResult.error.message,
		});
	const state = stateResult.value;
	const mode = state.operation === "rebase" ? "continue" : "start";
	let data = emptyData(request, null, mode, version.value, state);

	if (version.value !== GS_PROVIDER_VERSION) {
		return negative(`gh-stack ${GS_PROVIDER_VERSION} is required; found ${version.value}.`, {
			data,
		});
	}
	if (state.operation !== "none" && state.operation !== "rebase") {
		return negative(`Cannot restack while Git ${state.operation} is active.`, { data });
	}
	if (mode === "continue") {
		if (request.downstack)
			return usageError("--downstack cannot change an active rebase scope.", data);
		if (state.unmergedPaths.length > 0) {
			data = withRecovery(
				data,
				"resolve-conflicts",
				"Resolve and stage the listed conflicts, then rerun this command.",
				"conflict-stopped",
			);
			return negative("The rebase still has unresolved paths.", { data });
		}
		if (!state.hasStagedChanges) {
			data = withRecovery(
				data,
				"stage-resolution",
				"Stage the accepted resolution, then rerun this command.",
			);
			return negative("The continuation is not ready because no resolution is staged.", { data });
		}
		if (request.dryRun) return ok({ ...data, outcome: "dry-run" } satisfies GsRestackResult);
		const authorization = await authorize(invocation, request, data);
		if (authorization !== true) return authorization;
		const advanced = await context.provider.continueRestack();
		return await classifyAfter(context, data, state, [], advanced.ok ? null : advanced.error);
	}

	if (!state.clean)
		return negative("The worktree must be clean before starting a restack.", { data });
	if (state.checkout.branch === null)
		return negative("A named current branch is required.", { data });
	const topology = await context.provider.readTopology();
	if (!topology.ok)
		return inspectionFailure("Could not inspect gh-stack topology.", {
			...data,
			diagnostic: topology.error,
		});
	const selection = selectRange(topology.value, state.checkout.branch, request.downstack);
	if (selection === null)
		return negative("The current branch is not in the gh-stack topology.", { data });
	const occupancies = await context.git.readWorktreeOccupancy();
	if (!occupancies.ok)
		return failure("git-inspection-failed", "Could not inspect Git worktrees.", {
			detail: occupancies.error.message,
		});
	const occupied = occupancies.value.filter((item) => selection.branches.includes(item.branch));
	const refs = await context.git.readBranchRefs([
		...selection.branches,
		...(selection.baseAnchor === null ? [] : [selection.baseAnchor]),
	]);
	if (!refs.ok)
		return failure("git-inspection-failed", "Could not snapshot selected branch refs.", {
			detail: refs.error.message,
		});
	data = {
		...data,
		providerTopology: copyTopology(topology.value),
		selectedBranches: [...selection.branches],
		baseAnchor: selection.baseAnchor,
		occupiedBranches: occupied.map((item) => ({ ...item })),
		beforeRefs: refs.value.map((ref) => ({ ...ref })),
	};
	if (occupied.length > 0)
		return negative("A selected branch is occupied by another worktree.", { data });
	if (request.dryRun) return ok({ ...data, outcome: "dry-run" } satisfies GsRestackResult);
	const authorization = await authorize(invocation, request, data);
	if (authorization !== true) return authorization;
	const advanced = await context.provider.startRestack(request.downstack ? "downstack" : "full");
	return await classifyAfter(
		context,
		data,
		state,
		selection.branches,
		advanced.ok ? null : advanced.error,
	);
}

export function renderGsRestackHuman(data: GsRestackResult): string {
	const selected =
		data.selectedBranches === null
			? "unknown provider-established range"
			: data.selectedBranches.join(" → ");
	const changed = data.afterRefs
		.filter(
			(after) => data.beforeRefs.find((before) => before.name === after.name)?.sha !== after.sha,
		)
		.map((ref) => ref.name);
	return [
		`${data.outcome}: ${data.mode} (${data.effectiveScope})`,
		`Range: ${selected}`,
		`Changed refs: ${changed.length === 0 ? "none observed" : changed.join(", ")}`,
		`Next action: ${data.recovery.instruction}`,
	].join("\n");
}

async function authorize(
	invocation: GsRestackInvocation,
	request: GsRestackRequest,
	data: GsRestackResult,
) {
	if (request.yes) return true;
	if (!invocation.interactive)
		return usageError("This local branch rewrite requires --yes.", {
			...data,
			requiredOption: "--yes",
		});
	if (await invocation.confirm(`Advance the ${data.mode} restack operation?`)) return true;
	return negative("Restack was not authorized.", { data });
}

async function classifyAfter(
	context: GsRestackContext,
	data: GsRestackResult,
	beforeState: GsGitState,
	selected: readonly string[],
	diagnostic: GsCommandDiagnostic | null,
) {
	const state = await context.git.readState();
	if (!state.ok)
		return failure(
			"postcondition-inspection-failed",
			"Could not inspect post-restack Git state.",
			data,
		);
	let afterRefs: readonly GsBranchRef[] = [];
	let refsReadable = selected.length === 0;
	if (selected.length > 0) {
		const refs = await context.git.readBranchRefs(selected);
		if (refs.ok) {
			afterRefs = refs.value;
			refsReadable = true;
		}
	}
	const observed = {
		...data,
		git: gitData(state.value),
		afterRefs: afterRefs.map((ref) => ({ ...ref })),
		diagnostic,
	};
	if (
		diagnostic !== null &&
		sameGitState(beforeState, state.value) &&
		refsReadable &&
		(selected.length === 0 ||
			sameRefs(
				data.beforeRefs.filter((ref) => selected.includes(ref.name)),
				afterRefs,
			))
	) {
		return negative("The provider refused the restack without observed Git changes.", {
			data: withRecovery(
				observed,
				"fix-provider",
				"Fix the reported provider error, then rerun this command.",
			),
		});
	}
	if (state.value.operation === "rebase" && state.value.unmergedPaths.length > 0) {
		return negative("The provider stopped at another conflict.", {
			data: withRecovery(
				observed,
				"resolve-conflicts",
				"Resolve and stage this conflict, then rerun the same command.",
				"conflict-stopped",
			),
		});
	}
	const checks = [
		{ name: "no-active-rebase", passed: state.value.operation !== "rebase" },
		{ name: "clean-worktree", passed: state.value.clean },
		{
			name: "checkout-restored",
			passed:
				data.git.checkoutBranch === null || state.value.checkout.branch === data.git.checkoutBranch,
		},
		{ name: "selected-refs-readable", passed: refsReadable },
	];
	if (selected.length > 0) {
		const ancestryNames = [...(data.baseAnchor === null ? [] : [data.baseAnchor]), ...selected];
		let ancestryOk = true;
		for (let index = 1; index < ancestryNames.length; index += 1) {
			const ancestor = ancestryNames[index - 1];
			const descendant = ancestryNames[index];
			if (ancestor === undefined || descendant === undefined) continue;
			const edge = await context.git.isAncestor(ancestor, descendant);
			if (!edge.ok || !edge.value) ancestryOk = false;
		}
		checks.push({ name: "selected-ancestry-chained", passed: ancestryOk });
	}
	const topology = await context.provider.readTopology();
	if (topology.ok) observed.providerTopology = copyTopology(topology.value);
	checks.push({ name: "fresh-provider-topology", passed: topology.ok });
	if (selected.length > 0) {
		checks.push({
			name: "provider-range-settled",
			passed:
				topology.ok &&
				selected.every(
					(name) =>
						topology.value.branches.find((branch) => branch.name === name)?.needsRebase === false,
				),
		});
	} else {
		checks.push({
			name: "provider-checkout-restored",
			passed:
				topology.ok &&
				state.value.checkout.branch !== null &&
				topology.value.currentBranch === state.value.checkout.branch &&
				topology.value.branches.some(
					(branch) => branch.name === state.value.checkout.branch && branch.isCurrent,
				),
		});
		checks.push({
			name: "provider-topology-settled",
			passed: topology.ok && topology.value.branches.every((branch) => !branch.needsRebase),
		});
	}
	if (diagnostic === null && checks.every((check) => check.passed)) {
		const completed: GsRestackResult = {
			...observed,
			outcome: "completed",
			postconditions: checks,
			recovery: { action: "none", instruction: "Continue with the next workflow step." },
		};
		return ok(completed);
	}
	return failure("restack-outcome-ambiguous", "Restack completion could not be established.", {
		...observed,
		outcome: "ambiguous" as const,
		postconditions: checks,
		recovery: {
			action: "inspect-state",
			instruction: "Inspect the reported Git and provider facts before retrying.",
		},
	});
}

function selectRange(topology: GsProviderTopology, current: string, downstack: boolean) {
	const index = topology.branches.findIndex((branch) => branch.name === current);
	if (index < 0) return null;
	const firstIndex = downstack ? 0 : index;
	const branches = downstack
		? topology.branches.slice(0, index + 1)
		: topology.branches.slice(index);
	return {
		branches: branches.map((branch) => branch.name),
		baseAnchor:
			firstIndex === 0 ? topology.trunk : (topology.branches[firstIndex - 1]?.name ?? null),
	};
}

function emptyData(
	request: GsRestackRequest,
	diagnostic: GsCommandDiagnostic | null,
	mode: "start" | "continue" = "start",
	version = "unknown",
	state?: GsGitState,
): GsRestackResult {
	return {
		outcome: "refused",
		mode,
		requestedScope: request.downstack ? "downstack" : "full",
		effectiveScope:
			mode === "continue" ? "provider-established" : request.downstack ? "downstack" : "full",
		providerVersion: version,
		providerTopology: null,
		selectedBranches: null,
		baseAnchor: null,
		git:
			state === undefined
				? {
						operation: "none",
						clean: false,
						unmergedPaths: [],
						hasStagedChanges: false,
						checkoutBranch: null,
					}
				: gitData(state),
		occupiedBranches: [],
		beforeRefs: [],
		afterRefs: [],
		postconditions: [],
		recovery: {
			action: "fix-precondition",
			instruction: "Fix the reported precondition, then rerun this command.",
		},
		diagnostic,
		requiredOption: null,
	};
}

function copyTopology(topology: GsProviderTopology): GsRestackResult["providerTopology"] {
	return {
		trunk: topology.trunk,
		currentBranch: topology.currentBranch,
		branches: topology.branches.map((branch) => ({ ...branch })),
	};
}

function gitData(state: GsGitState): GsRestackResult["git"] {
	return {
		operation: state.operation,
		clean: state.clean,
		unmergedPaths: [...state.unmergedPaths],
		hasStagedChanges: state.hasStagedChanges,
		checkoutBranch: state.checkout.branch,
	};
}

function sameGitState(left: GsGitState, right: GsGitState): boolean {
	return (
		left.checkout.branch === right.checkout.branch &&
		left.checkout.head === right.checkout.head &&
		left.operation === right.operation &&
		left.clean === right.clean &&
		left.hasStagedChanges === right.hasStagedChanges &&
		left.unmergedPaths.length === right.unmergedPaths.length &&
		left.unmergedPaths.every((path, index) => path === right.unmergedPaths[index])
	);
}

function sameRefs(left: readonly GsBranchRef[], right: readonly GsBranchRef[]): boolean {
	return (
		left.length === right.length &&
		right.every((after) => left.find((before) => before.name === after.name)?.sha === after.sha)
	);
}

function withRecovery(
	data: GsRestackResult,
	action: GsRestackResult["recovery"]["action"],
	instruction: string,
	outcome: GsRestackResult["outcome"] = "refused",
): GsRestackResult {
	return { ...data, outcome, recovery: { action, instruction } };
}

function inspectionFailure(message: string, data: GsRestackResult) {
	return failure("restack-inspection-failed", message, data);
}
