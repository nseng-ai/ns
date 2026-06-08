import { describe, expect, test } from "vitest";

import { formatCommand } from "../src/command-runtime.ts";
import {
	PLAN_BRANCH_NAMESPACE,
	buildPlannedBranchCreateOperation,
	formatPlannedBranchCreateFailure,
	formatPlannedBranchCreatePreview,
	formatPlannedBranchEvidence,
	resolvePlannedBranchCreatePreviewContext,
	tryNormalizeBranchCreationMethod,
} from "../src/planned-branch-creation.ts";
import type { PlanCommandExecApi } from "../src/plan-persistence.ts";
import { InMemoryPlannedBranchGitGateway } from "./support/in-memory-git-gateway.ts";

const PLAN_SLUG = "branch-scoped-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const PLAN_FILE = "/tmp/branch-scoped-plan.md";
const TARGET_BRANCH = "planned-branches/branch-scoped-plan";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_BRANCH = "feature/source-plan";

const NO_COMMANDS: PlanCommandExecApi = {
	async exec() {
		throw new Error("unexpected command execution");
	},
};

describe("buildPlannedBranchCreateOperation", () => {
	test("derives the default branch, key, namespace, params, and normalized summary", () => {
		const operation = buildPlannedBranchCreateOperation({
			slug: `  ${PLAN_SLUG}  `,
			filePath: PLAN_FILE,
			branchCreation: "graphite",
			summary: "  Create the branch.  ",
		});

		expect(operation).toEqual({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branch: PLAN_SLUG,
			branchCreation: "graphite",
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			params: {
				slug: PLAN_SLUG,
				filePath: PLAN_FILE,
				branchCreation: "graphite",
				summary: "Create the branch.",
			},
			summary: "Create the branch.",
		});
	});

	test("keeps the storage key slug-derived when an explicit branch is supplied", () => {
		const operation = buildPlannedBranchCreateOperation({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchName: `  ${TARGET_BRANCH}  `,
			summary: "   ",
		});

		expect(operation.branch).toBe(TARGET_BRANCH);
		expect(operation.key).toBe(PLAN_KEY);
		expect(operation.summary).toBeUndefined();
		expect(operation.params).toEqual({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchCreation: "plain-git",
			branchName: TARGET_BRANCH,
		});
	});

	test("derives TypeScript recipe attachment keys when requested", () => {
		const operation = buildPlannedBranchCreateOperation({
			slug: PLAN_SLUG,
			filePath: "/tmp/branch-scoped-plan.plan.ts",
			planFileKind: "typescript-recipe",
		});

		expect(operation.key).toBe(`${PLAN_SLUG}.plan.ts`);
		expect(operation.params).toEqual({
			slug: PLAN_SLUG,
			filePath: "/tmp/branch-scoped-plan.plan.ts",
			branchCreation: "plain-git",
			planFileKind: "typescript-recipe",
		});
	});

	test("preserves existing validation errors for invalid inputs", () => {
		expect(() => buildPlannedBranchCreateOperation({ slug: "Branch Scoped Plan", filePath: PLAN_FILE })).toThrow("Invalid plan slug");
		expect(() => buildPlannedBranchCreateOperation({ slug: PLAN_SLUG, filePath: PLAN_FILE, branchName: "bad branch" })).toThrow(
			"Invalid target branch name",
		);
		expect(() => buildPlannedBranchCreateOperation({ slug: PLAN_SLUG, filePath: PLAN_FILE, branchCreation: "hg" })).toThrow(
			"parameter `branchCreation` must be one of `plain-git` or `graphite`",
		);
		expect(() => buildPlannedBranchCreateOperation({ slug: PLAN_SLUG })).toThrow("requires string parameter `filePath`");
	});
});

describe("branch creation normalization", () => {
	test("returns undefined instead of throwing for absent or invalid branch creation methods", () => {
		expect(tryNormalizeBranchCreationMethod(undefined)).toBeUndefined();
		expect(tryNormalizeBranchCreationMethod("graphite")).toBe("graphite");
		expect(tryNormalizeBranchCreationMethod("plain-git")).toBe("plain-git");
		expect(tryNormalizeBranchCreationMethod("hg")).toBeUndefined();
		expect(tryNormalizeBranchCreationMethod(123)).toBeUndefined();
	});
});

describe("planned-branch create preview", () => {
	test("formats Graphite mutation commands owned by planned-branch", () => {
		const operation = buildPlannedBranchCreateOperation({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchName: TARGET_BRANCH,
			branchCreation: "graphite",
		});

		const text = formatPlannedBranchCreatePreview(operation, { startPoint: START_POINT, graphiteParentBranch: SOURCE_BRANCH });

		expect(text).toContain("Target:");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Branch Memory namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(text).toContain(formatCommand("git", ["branch", TARGET_BRANCH, "HEAD"]));
		expect(text).toContain(formatCommand("gt", ["track", TARGET_BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"]));
		expect(text).toContain(
			formatCommand("brmem", ["put", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", TARGET_BRANCH, "--file", PLAN_FILE, "--format", "json"]),
		);
	});

	test("omits Graphite tracking for plain Git preview", () => {
		const operation = buildPlannedBranchCreateOperation({ slug: PLAN_SLUG, filePath: PLAN_FILE, branchCreation: "plain-git" });

		const text = formatPlannedBranchCreatePreview(operation, { startPoint: START_POINT });

		expect(text).toContain(formatCommand("git", ["branch", PLAN_SLUG, "HEAD"]));
		expect(text).not.toContain("gt track");
	});

	test("resolves preview context through the semantic git gateway", async () => {
		const git = new InMemoryPlannedBranchGitGateway({ headCommit: START_POINT });

		const context = await resolvePlannedBranchCreatePreviewContext(NO_COMMANDS, { cwd: "/repo", git });

		expect(context).toEqual({ startPoint: START_POINT });
		expect(git.headCommitCalls).toEqual([{ cwd: "/repo" }]);
	});
});

describe("planned-branch create formatting", () => {
	test("formats all success evidence fields", () => {
		const text = formatPlannedBranchEvidence({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			branchCreation: "graphite",
			startPoint: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---branch-scoped-plan:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: PLAN_FILE,
			summary: "Create the branch.",
		});

		expect(text).toContain("Created planned branch and attached plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain(`Ref: refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---branch-scoped-plan:${PLAN_KEY}`);
		expect(text).toContain("Commit: abc123");
		expect(text).toContain(`Source file: ${PLAN_FILE}`);
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Summary: Create the branch.");
	});

	test("formats planned-branch failure context with normalized error messages", () => {
		const operation = buildPlannedBranchCreateOperation({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchName: TARGET_BRANCH,
			branchCreation: "graphite",
		});

		const text = formatPlannedBranchCreateFailure(operation, new Error("branch already exists"));

		expect(text).toContain("Failed to create planned branch and attach plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain(`Source file: ${PLAN_FILE}`);
		expect(text).toContain("branch already exists");
	});
});
