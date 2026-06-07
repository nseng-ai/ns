import {
	formatPlannedBranchEvidence,
	type BranchCreationMethod,
	type PlannedBranchEvidence,
} from "./planned-branch-creation.ts";

export const PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE = "planned-branch-output";

export type PlannedBranchOutputStatus = "usage" | "dry-run" | "success" | "failure" | "cancelled";

export interface PlannedBranchOutputDetails {
	status: PlannedBranchOutputStatus;
	evidence?: PlannedBranchEvidence;
	error?: string;
}

export function extractPlannedBranchEvidence(details: unknown): PlannedBranchEvidence | undefined {
	if (!isRecord(details) || details.status !== "success") {
		return undefined;
	}

	const evidence = details.evidence;
	if (!isRecord(evidence)) {
		return undefined;
	}

	const slug = requiredStringField(evidence, "slug");
	const branch = requiredStringField(evidence, "branch");
	const branchCreation = branchCreationField(evidence, "branchCreation");
	const startPoint = requiredStringField(evidence, "startPoint");
	const namespace = requiredStringField(evidence, "namespace");
	const key = requiredStringField(evidence, "key");
	const refName = requiredStringField(evidence, "refName");
	const commit = requiredStringField(evidence, "commit");
	const sourceFile = requiredStringField(evidence, "sourceFile");
	if (
		slug === undefined ||
		branch === undefined ||
		branchCreation === undefined ||
		startPoint === undefined ||
		namespace === undefined ||
		key === undefined ||
		refName === undefined ||
		commit === undefined ||
		sourceFile === undefined
	) {
		return undefined;
	}

	const summary = evidence.summary;
	if (summary === undefined) {
		return { slug, branch, branchCreation, startPoint, namespace, key, refName, commit, sourceFile };
	}
	if (typeof summary !== "string") {
		return undefined;
	}
	return { slug, branch, branchCreation, startPoint, namespace, key, refName, commit, sourceFile, summary };
}

export function formatPlanBranchEvidence(evidence: PlannedBranchEvidence): string {
	return formatPlannedBranchEvidence(evidence);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredStringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function branchCreationField(record: Record<string, unknown>, key: string): BranchCreationMethod | undefined {
	const value = record[key];
	return value === "plain-git" || value === "graphite" ? value : undefined;
}
