import { describe, expect, test } from "vitest";

import {
	BRANCH_CONTEXT_NAMESPACE,
	BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
	extractBranchContextEvidence,
	extractBranchContextEvidenceFromSessionEntry,
	formatBranchContextEvidence,
} from "@asdl/branch-context";

const EVIDENCE = {
	slug: "branch-scoped-plan",
	branch: "branch-contexts/branch-scoped-plan",
	branchCreation: "graphite",
	startPoint: "0123456789abcdef0123456789abcdef01234567",
	namespace: BRANCH_CONTEXT_NAMESPACE,
	key: "branch-scoped-plan.md",
	refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/branch-contexts---branch-scoped-plan:branch-scoped-plan.md`,
	commit: "abc123",
	sourceFile: "/tmp/branch-scoped-plan.md",
	summary: "Create the branch.",
} as const;

describe("branch-context session artifact", () => {
	test("defines the branch-context output message type", () => {
		expect(BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE).toBe("branch-context-output");
	});

	test("extracts success evidence from output details", () => {
		expect(extractBranchContextEvidence({ status: "success", evidence: EVIDENCE })).toEqual(EVIDENCE);
	});

	test("accepts but strips unknown output detail and evidence keys", () => {
		const result = extractBranchContextEvidence({
			status: "success",
			evidence: { ...EVIDENCE, extraEvidence: "ignored" },
			extraDetail: "ignored",
		});

		expect(result).toEqual(EVIDENCE);
		expect(result).not.toHaveProperty("extraEvidence");
	});

	test("rejects non-success and malformed output details", () => {
		expect(extractBranchContextEvidence({ status: "dry-run", evidence: EVIDENCE })).toBeUndefined();
		expect(extractBranchContextEvidence({ status: "success", evidence: { ...EVIDENCE, branchCreation: "hg" } })).toBeUndefined();
		expect(extractBranchContextEvidence({ status: "success", evidence: { ...EVIDENCE, commit: "" } })).toBeUndefined();
		expect(extractBranchContextEvidence({ status: "success", evidence: { ...EVIDENCE, summary: 123 } })).toBeUndefined();
	});

	test("extracts evidence from a wrapped session history entry", () => {
		const entry = {
			type: "message",
			message: {
				role: "custom",
				customType: BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
				display: true,
				content: "Created branch context and attached plan.",
				details: { status: "success", evidence: EVIDENCE },
			},
		};

		expect(extractBranchContextEvidenceFromSessionEntry(entry)).toEqual(EVIDENCE);
	});

	test("extracts evidence from a bare message-shaped entry", () => {
		const entry = {
			customType: BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE,
			content: "Created branch context and attached plan.",
			details: { status: "success", evidence: EVIDENCE },
		};

		expect(extractBranchContextEvidenceFromSessionEntry(entry)).toEqual(EVIDENCE);
	});

	test("rejects entries that are not branch-context output messages", () => {
		expect(extractBranchContextEvidenceFromSessionEntry(undefined)).toBeUndefined();
		expect(extractBranchContextEvidenceFromSessionEntry(null)).toBeUndefined();
		expect(extractBranchContextEvidenceFromSessionEntry("Created branch context and attached plan.")).toBeUndefined();
		expect(extractBranchContextEvidenceFromSessionEntry({ type: "message", message: "prose, not a record" })).toBeUndefined();
		expect(
			extractBranchContextEvidenceFromSessionEntry({
				type: "message",
				message: { role: "custom", customType: "other-output", display: true, content: "x", details: { status: "success", evidence: EVIDENCE } },
			}),
		).toBeUndefined();
		expect(
			extractBranchContextEvidenceFromSessionEntry({
				type: "toolResult",
				toolName: "write_saved_plan_file",
				details: { status: "success", evidence: EVIDENCE },
			}),
		).toBeUndefined();
	});

	test("rejects branch-context output entries whose details are not full success evidence", () => {
		const entryWith = (details: unknown): unknown => ({
			type: "message",
			message: { role: "custom", customType: BRANCH_CONTEXT_OUTPUT_MESSAGE_TYPE, display: true, content: "x", details },
		});

		expect(extractBranchContextEvidenceFromSessionEntry(entryWith(undefined))).toBeUndefined();
		expect(extractBranchContextEvidenceFromSessionEntry(entryWith({ status: "failure", error: "boom" }))).toBeUndefined();
		// Reuse-shaped success details carry only branch/key/source — intentionally not evidence-bearing.
		expect(
			extractBranchContextEvidenceFromSessionEntry(
				entryWith({ status: "success", reuse: { branch: EVIDENCE.branch, key: EVIDENCE.key, source: "current-branch" } }),
			),
		).toBeUndefined();
	});

	test("formats evidence with the branch-context domain formatter", () => {
		const text = formatBranchContextEvidence(EVIDENCE);

		expect(text).toContain("Created branch context and attached plan.");
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
