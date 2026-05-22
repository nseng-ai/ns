export const STACK_PLANS_NAMESPACE = "stack-plans";
export const STACK_IMPLS_NAMESPACE = "stack-impls";
export const SESSION_ARTIFACTS_NAMESPACE = "session-artifacts";

export type BranchMemoryKey = {
	namespace: string;
	key: string;
};

export function validateObjectiveSlug(objective: string): void {
	if (objective.length === 0) {
		throw new Error("Objective slug must be non-empty.");
	}
	if (objective.trim() !== objective) {
		throw new Error("Objective slug must not contain surrounding whitespace.");
	}
	if (objective.includes("/")) {
		throw new Error("Objective slug must be a single key segment and must not contain `/`.");
	}
	if (objective.includes("..")) {
		throw new Error("Objective slug must not contain `..`.");
	}
}

export function escapeBranchForKey(branch: string): string {
	if (branch.length === 0) {
		throw new Error("Branch name must be non-empty.");
	}
	if (branch.includes("---")) {
		throw new Error("Branch name must not contain literal `---` because it is used as the key escape.");
	}
	return branch.replaceAll("/", "---");
}

export function derivePlanKey(objective: string): BranchMemoryKey {
	validateObjectiveSlug(objective);
	return {
		namespace: STACK_PLANS_NAMESPACE,
		key: `${objective}.md`,
	};
}

export function deriveLedgerKey(objective: string, branch: string): BranchMemoryKey {
	validateObjectiveSlug(objective);
	return {
		namespace: STACK_IMPLS_NAMESPACE,
		key: `${objective}/${escapeBranchForKey(branch)}.md`,
	};
}

export function deriveHandoffKey(objective: string, branch: string): BranchMemoryKey {
	validateObjectiveSlug(objective);
	return {
		namespace: SESSION_ARTIFACTS_NAMESPACE,
		key: `handoffs/${objective}-${escapeBranchForKey(branch)}.md`,
	};
}

export function objectiveFromPlanKey(key: string): string {
	if (!key.endsWith(".md")) {
		throw new Error("Plan key must end with `.md`.");
	}
	const objective = key.slice(0, -".md".length);
	validateObjectiveSlug(objective);
	return objective;
}
