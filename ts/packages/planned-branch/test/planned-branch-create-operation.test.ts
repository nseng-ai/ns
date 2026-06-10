import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCommand } from "@asdl/plans";
import {
	PLAN_BRANCH_NAMESPACE,
	buildPlannedBranchCreateOperation,
	createPlannedBranchFromFile,
	formatPlannedBranchCreateFailure,
	formatPlannedBranchCreatePreview,
	formatPlannedBranchEvidence,
	resolvePlannedBranchCreatePreviewContext,
	tryNormalizeBranchCreationMethod,
} from "../src/planned-branch-creation.ts";
import type { PlanCommandExecApi } from "@asdl/plans";
import { InMemoryPlannedBranchBrmemGateway } from "./support/in-memory-brmem-gateway.ts";
import { InMemoryPlannedBranchGitGateway } from "./support/in-memory-git-gateway.ts";
import { InMemoryPlannedBranchGraphiteGateway } from "./support/in-memory-graphite-gateway.ts";

const PLAN_SLUG = "branch-scoped-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const PLAN_FILE = "/tmp/branch-scoped-plan.md";
const TARGET_BRANCH = "planned-branches/branch-scoped-plan";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_BRANCH = "feature/source-plan";
const ROOT = "/repo";

const tempDirs: string[] = [];

const NO_COMMANDS: PlanCommandExecApi = {
	async exec() {
		throw new Error("unexpected command execution");
	},
};

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix = "planned-branch-create-operation-"): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

async function makePlanFile(): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, "plan.md");
	await writeFile(filePath, "# Plan\n", "utf8");
	return filePath;
}

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
		expect(text).toContain(formatCommand("gt", ["info", SOURCE_BRANCH, "--no-interactive"]));
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
		expect(text).not.toContain("gt info");
		expect(text).not.toContain("gt track");
	});

	test("resolves preview context through the semantic git gateway", async () => {
		const git = new InMemoryPlannedBranchGitGateway({ headCommit: START_POINT });

		const context = await resolvePlannedBranchCreatePreviewContext(NO_COMMANDS, { cwd: "/repo", git });

		expect(context).toEqual({ startPoint: START_POINT });
		expect(git.headCommitCalls).toEqual([{ cwd: "/repo" }]);
	});
});

describe("planned-branch create execution", () => {
	test("Graphite creation checks parent trackedness before tracking the new branch", async () => {
		const git = new InMemoryPlannedBranchGitGateway({ optionalRepoRoot: { type: "missing" }, sourceBranch: SOURCE_BRANCH, headCommit: START_POINT });
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const graphite = new InMemoryPlannedBranchGraphiteGateway();
		const filePath = await makePlanFile();

		const evidence = await createPlannedBranchFromFile(
			NO_COMMANDS,
			{ slug: PLAN_SLUG, filePath, branchName: TARGET_BRANCH, branchCreation: "graphite" },
			{ cwd: ROOT, git, brmem, graphite },
		);

		expect(evidence).toMatchObject({ branch: TARGET_BRANCH, branchCreation: "graphite", key: PLAN_KEY, sourceFile: filePath });
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: ROOT, branch: SOURCE_BRANCH }]);
		expect(git.createBranchAtHeadCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH }]);
		expect(graphite.trackBranchCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH, parentBranch: SOURCE_BRANCH }]);
		expect(brmem.attachPlanCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH, key: PLAN_KEY, sourceFile: filePath }]);
	});

	test("untracked Graphite parents fail before creating a branch or attaching the plan", async () => {
		const git = new InMemoryPlannedBranchGitGateway({ optionalRepoRoot: { type: "missing" }, sourceBranch: SOURCE_BRANCH, headCommit: START_POINT });
		const brmem = new InMemoryPlannedBranchBrmemGateway();
		const graphite = new InMemoryPlannedBranchGraphiteGateway({
			untrackedBranches: [SOURCE_BRANCH],
			untrackedDetail: `ERROR: Cannot perform this operation on untracked branch ${SOURCE_BRANCH}.`,
		});
		const filePath = await makePlanFile();

		await expect(
			createPlannedBranchFromFile(
				NO_COMMANDS,
				{ slug: PLAN_SLUG, filePath, branchName: TARGET_BRANCH, branchCreation: "graphite" },
				{ cwd: ROOT, git, brmem, graphite },
			),
		).rejects.toThrow("Current branch is not tracked by Graphite; refusing to stack a planned branch on it.");
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(git.existingBranches).not.toContain(TARGET_BRANCH);
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: ROOT, branch: SOURCE_BRANCH }]);
		expect(graphite.trackBranchCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
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
