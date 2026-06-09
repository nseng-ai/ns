import { describe, expect, test } from "vitest";

import {
	PLAN_BRANCH_NAMESPACE,
	PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE,
	extractPlannedBranchEvidence,
	formatPlanBranchEvidence,
} from "@asdl/planned-branch";

const EVIDENCE = {
	slug: "branch-scoped-plan",
	branch: "planned-branches/branch-scoped-plan",
	branchCreation: "graphite",
	startPoint: "0123456789abcdef0123456789abcdef01234567",
	namespace: PLAN_BRANCH_NAMESPACE,
	key: "branch-scoped-plan.md",
	refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---branch-scoped-plan:branch-scoped-plan.md`,
	commit: "abc123",
	sourceFile: "/tmp/branch-scoped-plan.md",
	summary: "Create the branch.",
} as const;

describe("planned-branch session artifact", () => {
	test("defines the planned-branch output message type", () => {
		expect(PLANNED_BRANCH_OUTPUT_MESSAGE_TYPE).toBe("planned-branch-output");
	});

	test("extracts success evidence from output details", () => {
		expect(extractPlannedBranchEvidence({ status: "success", evidence: EVIDENCE })).toEqual(EVIDENCE);
	});

	test("rejects non-success and malformed output details", () => {
		expect(extractPlannedBranchEvidence({ status: "dry-run", evidence: EVIDENCE })).toBeUndefined();
		expect(extractPlannedBranchEvidence({ status: "success", evidence: { ...EVIDENCE, branchCreation: "hg" } })).toBeUndefined();
		expect(extractPlannedBranchEvidence({ status: "success", evidence: { ...EVIDENCE, commit: "" } })).toBeUndefined();
		expect(extractPlannedBranchEvidence({ status: "success", evidence: { ...EVIDENCE, summary: 123 } })).toBeUndefined();
	});

	test("formats evidence with the planned-branch domain formatter", () => {
		const text = formatPlanBranchEvidence(EVIDENCE);

		expect(text).toContain("Created planned branch and attached plan.");
		expect(text).toContain(`Branch: ${EVIDENCE.branch}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${EVIDENCE.startPoint}`);
		expect(text).toContain(`Namespace: ${EVIDENCE.namespace}`);
		expect(text).toContain(`Key: ${EVIDENCE.key}`);
		expect(text).toContain(`Ref: ${EVIDENCE.refName}`);
		expect(text).toContain(`Commit: ${EVIDENCE.commit}`);
		expect(text).toContain(`Source file: ${EVIDENCE.sourceFile}`);
		expect(text).toContain(`Slug: ${EVIDENCE.slug}`);
		expect(text).toContain(`Summary: ${EVIDENCE.summary}`);
	});
});
