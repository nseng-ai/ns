import type { SubmitStackBranch } from "./submit-stack-inspection.ts";
import type {
	SubmitBranchPrDisposition,
	SubmitBranchPrIdentity,
	SubmitBranchPrInventoryResult,
} from "./submit-stack-inspection.ts";

export interface ReconciledSubmitPr extends SubmitBranchPrIdentity {
	branch: string;
}

export interface SubmitPrReconciliationSuccess {
	kind: "success";
	prs: readonly ReconciledSubmitPr[];
	metadataTargets: readonly ReconciledSubmitPr[];
}

export interface SubmitPrReconciliationFailure {
	kind: "failure";
	dispositions: readonly SubmitPrReconciliationFailureDisposition[];
	resolvedPrs: readonly ReconciledSubmitPr[];
}

export type SubmitPrReconciliationFailureDisposition =
	| Exclude<SubmitBranchPrDisposition, { kind: "resolved" }>
	| {
			kind: "existing-pr-changed";
			branch: string;
			expected: SubmitBranchPrIdentity;
			actual: SubmitBranchPrIdentity;
	  }
	| {
			kind: "duplicate-pr";
			branch: string;
			otherBranch: string;
			pr: SubmitBranchPrIdentity;
	  };

export type SubmitPrReconciliationResult =
	| SubmitPrReconciliationSuccess
	| SubmitPrReconciliationFailure;

export function reconcileSubmitPrInventory(input: {
	plannedBranches: readonly SubmitStackBranch[];
	inventory: SubmitBranchPrInventoryResult;
}): SubmitPrReconciliationResult {
	const plannedByBranch = new Map(input.plannedBranches.map((branch) => [branch.branch, branch]));
	const dispositionsByBranch = new Map(
		input.inventory.dispositions.map((disposition) => [disposition.branch, disposition]),
	);
	const failures: SubmitPrReconciliationFailureDisposition[] = [];
	const resolvedPrs: ReconciledSubmitPr[] = [];
	const metadataTargets: ReconciledSubmitPr[] = [];
	const ownerByPrNumber = new Map<number, string>();

	for (const planned of input.plannedBranches) {
		const disposition = dispositionsByBranch.get(planned.branch);
		if (disposition === undefined) {
			failures.push({ kind: "missing", branch: planned.branch });
			continue;
		}
		if (disposition.kind !== "resolved") {
			failures.push(disposition);
			continue;
		}
		const resolved = { branch: planned.branch, ...disposition.pr };
		const otherBranch = ownerByPrNumber.get(resolved.number);
		if (otherBranch !== undefined) {
			failures.push({
				kind: "duplicate-pr",
				branch: planned.branch,
				otherBranch,
				pr: disposition.pr,
			});
			continue;
		}
		ownerByPrNumber.set(resolved.number, planned.branch);
		resolvedPrs.push(resolved);
		if (planned.kind === "existing" && planned.pr.number !== resolved.number) {
			failures.push({
				kind: "existing-pr-changed",
				branch: planned.branch,
				expected: planned.pr,
				actual: disposition.pr,
			});
			continue;
		}
		if (planned.kind === "new") metadataTargets.push(resolved);
	}

	for (const disposition of input.inventory.dispositions) {
		if (!plannedByBranch.has(disposition.branch)) {
			throw new Error(`Post-submit inventory included unplanned branch ${disposition.branch}.`);
		}
	}

	return failures.length === 0
		? { kind: "success", prs: resolvedPrs, metadataTargets }
		: { kind: "failure", dispositions: failures, resolvedPrs };
}
