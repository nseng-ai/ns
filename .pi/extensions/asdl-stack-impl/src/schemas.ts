import { parse } from "yaml";

import { STACK_PLANS_NAMESPACE, objectiveFromPlanKey, validateObjectiveSlug } from "./keys.ts";

export const STACK_PLAN_SCHEMA = "asdl.stack-plan.v1";
export const STACK_SLICE_LEDGER_SCHEMA = "asdl.stack-slice-ledger.v1";

export type StackPlanFrontmatter = {
	schema: typeof STACK_PLAN_SCHEMA;
	objective: string;
	plannedBranches: string[];
};

export type SliceLedgerFrontmatter = {
	schema: typeof STACK_SLICE_LEDGER_SCHEMA;
	plan: {
		branch: string;
		namespace: typeof STACK_PLANS_NAMESPACE;
		key: string;
		sha256: string;
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseYamlMapping(frontmatterText: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = parse(frontmatterText);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid YAML frontmatter: ${message}`);
	}

	if (!isRecord(parsed)) {
		throw new Error("Frontmatter must be a YAML mapping/object.");
	}

	return parsed;
}

function requireOnlyKeys(value: Record<string, unknown>, allowedKeys: string[], label: string): void {
	const allowed = new Set(allowedKeys);
	const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
	if (unexpected.length > 0) {
		throw new Error(`${label} contains unsupported field(s): ${unexpected.join(", ")}.`);
	}
}

function requireString(value: unknown, label: string): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string.`);
	}
	return value;
}

function validatePlannedBranch(branch: string, index: number): void {
	if (branch.length === 0) {
		throw new Error(`planned_branches[${index}] must be a non-empty string.`);
	}
	if (branch.includes("---")) {
		throw new Error(`planned_branches[${index}] must not contain literal \`---\`.`);
	}
}

export function validateStackPlanFrontmatter(
	frontmatterText: string,
	body: string,
): StackPlanFrontmatter {
	const parsed = parseYamlMapping(frontmatterText);
	requireOnlyKeys(parsed, ["schema", "objective", "planned_branches"], "Stack plan frontmatter");

	if (parsed.schema !== STACK_PLAN_SCHEMA) {
		throw new Error(`Stack plan schema must be exactly ${STACK_PLAN_SCHEMA}.`);
	}

	const objective = requireString(parsed.objective, "objective");
	validateObjectiveSlug(objective);

	const plannedBranches = parsed.planned_branches;
	if (!Array.isArray(plannedBranches) || plannedBranches.length === 0) {
		throw new Error("planned_branches must be a non-empty array.");
	}

	const seenBranches = new Set<string>();
	const branches = plannedBranches.map((branch, index) => {
		if (typeof branch !== "string") {
			throw new Error(`planned_branches[${index}] must be a string.`);
		}
		validatePlannedBranch(branch, index);
		if (seenBranches.has(branch)) {
			throw new Error(`planned_branches contains duplicate branch: ${branch}.`);
		}
		seenBranches.add(branch);
		if (!body.includes(branch)) {
			throw new Error(`planned branch ${branch} must appear literally in the Markdown body.`);
		}
		return branch;
	});

	return {
		schema: STACK_PLAN_SCHEMA,
		objective,
		plannedBranches: branches,
	};
}

function validateSha256(sha256: string): void {
	if (!/^[0-9a-f]{64}$/.test(sha256)) {
		throw new Error("plan.sha256 must be a lowercase 64-character hex SHA-256 digest.");
	}
}

export function validateSliceLedgerFrontmatter(frontmatterText: string): SliceLedgerFrontmatter {
	const parsed = parseYamlMapping(frontmatterText);
	requireOnlyKeys(parsed, ["schema", "plan"], "Slice ledger frontmatter");

	if (parsed.schema !== STACK_SLICE_LEDGER_SCHEMA) {
		throw new Error(`Slice ledger schema must be exactly ${STACK_SLICE_LEDGER_SCHEMA}.`);
	}
	if (!isRecord(parsed.plan)) {
		throw new Error("plan must be a YAML mapping/object.");
	}
	requireOnlyKeys(parsed.plan, ["branch", "namespace", "key", "sha256"], "Slice ledger plan");

	const branch = requireString(parsed.plan.branch, "plan.branch");
	if (branch.length === 0) {
		throw new Error("plan.branch must be a non-empty string.");
	}
	if (parsed.plan.namespace !== STACK_PLANS_NAMESPACE) {
		throw new Error(`plan.namespace must be exactly ${STACK_PLANS_NAMESPACE}.`);
	}
	const key = requireString(parsed.plan.key, "plan.key");
	objectiveFromPlanKey(key);
	const sha256 = requireString(parsed.plan.sha256, "plan.sha256");
	validateSha256(sha256);

	return {
		schema: STACK_SLICE_LEDGER_SCHEMA,
		plan: {
			branch,
			namespace: STACK_PLANS_NAMESPACE,
			key,
			sha256,
		},
	};
}
