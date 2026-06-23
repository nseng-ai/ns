import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCommand } from "@sdl/core/exec";
import {
	BRANCH_CONTEXT_NAMESPACE,
	buildBranchContextCreateOperation,
	createBranchContextFromFile,
	formatBranchContextCreateFailure,
	formatBranchContextCreatePreview,
	formatBranchContextEvidence,
	resolveBranchContextCreatePreviewContext,
} from "../src/branch-context-creation.ts";
import type { CommandExecApi } from "@sdl/core/exec";
import { InMemoryBranchMemoryGateway } from "@sdl/branch-context/testing";
import type { BranchContextContext } from "../src/context.ts";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { InMemoryGraphiteBranchGateway } from "@sdl/graphite/testing";

const PLAN_SLUG = "branch-scoped-plan";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const PLAN_FILE = "/tmp/branch-scoped-plan.md";
const TARGET_BRANCH = "branch-contexts/branch-scoped-plan";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_BRANCH = "feature/source-plan";
const ROOT = "/repo";

const tempDirs: string[] = [];

const NO_COMMANDS: CommandExecApi = {
	async exec() {
		throw new Error("unexpected command execution");
	},
};

function branchContext(overrides: Partial<BranchContextContext> = {}): BranchContextContext {
	const commands = overrides.commands ?? NO_COMMANDS;
	return {
		commands,
		git: overrides.git ?? new InMemoryGitGateway(),
		brmem: overrides.brmem ?? new InMemoryBranchMemoryGateway(),
		graphite: overrides.graphite ?? new InMemoryGraphiteBranchGateway(),
	};
}

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix = "branch-context-create-operation-"): Promise<string> {
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

describe("buildBranchContextCreateOperation", () => {
	test("derives the default branch, key, namespace, params, and normalized summary", () => {
		const operation = buildBranchContextCreateOperation({
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
			namespace: BRANCH_CONTEXT_NAMESPACE,
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
		const operation = buildBranchContextCreateOperation({
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
});

describe("branch-context create preview", () => {
	test("formats Graphite mutation commands owned by branch-context", () => {
		const operation = buildBranchContextCreateOperation({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchName: TARGET_BRANCH,
			branchCreation: "graphite",
		});

		const text = formatBranchContextCreatePreview(operation, {
			startPoint: START_POINT,
			graphiteParentBranch: SOURCE_BRANCH,
		});

		expect(text).toContain("Target:");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Branch Memory namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(text).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(text).toContain(formatCommand("gt", ["info", SOURCE_BRANCH, "--no-interactive"]));
		expect(text).toContain(formatCommand("git", ["branch", TARGET_BRANCH, "HEAD"]));
		expect(text).toContain(
			formatCommand("gt", ["track", TARGET_BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"]),
		);
		expect(text).toContain("Branch-context operations that would run:");
		expect(text).toContain("Attach plan through the in-process Branch Memory gateway:");
		expect(text).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain(`Source file: ${PLAN_FILE}`);
		expect(text).not.toContain("brmem put");
	});

	test("omits Graphite tracking for plain Git preview", () => {
		const operation = buildBranchContextCreateOperation({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchCreation: "plain-git",
		});

		const text = formatBranchContextCreatePreview(operation, { startPoint: START_POINT });

		expect(text).toContain(formatCommand("git", ["branch", PLAN_SLUG, "HEAD"]));
		expect(text).not.toContain("gt info");
		expect(text).not.toContain("gt track");
	});

	test("resolves preview context through the semantic git gateway", async () => {
		const git = new InMemoryGitGateway({ headCommit: START_POINT });

		const context = await resolveBranchContextCreatePreviewContext(NO_COMMANDS, {
			cwd: "/repo",
			context: branchContext({ git }),
		});

		expect(context).toEqual({ startPoint: START_POINT });
		expect(git.headCommitCalls).toEqual([{ cwd: "/repo" }]);
	});
});

describe("branch-context create execution", () => {
	test("invalid target branch refs fail before source file resolution, branch creation, or attachment", async () => {
		const invalidBranch = "bad branch";
		const git = new InMemoryGitGateway({ invalidBranchRefs: [invalidBranch] });
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const filePath = await makePlanFile();

		await expect(
			createBranchContextFromFile(
				NO_COMMANDS,
				{ slug: PLAN_SLUG, filePath, branchName: invalidBranch, branchCreation: "plain-git" },
				{ cwd: ROOT, context: branchContext({ git, brmem, graphite }) },
			),
		).rejects.toThrow(`Invalid branch ref: ${invalidBranch}`);
		expect(git.validateBranchRefCalls).toEqual([{ cwd: ROOT, branch: invalidBranch }]);
		expect(git.headCommitCalls).toEqual([]);
		expect(git.localBranchPresenceCalls).toEqual([]);
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(graphite.checkBranchTrackedCalls).toEqual([]);
		expect(graphite.trackBranchCalls).toEqual([]);
	});

	test("Graphite creation checks parent trackedness before tracking the new branch", async () => {
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
		});
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const filePath = await makePlanFile();

		const evidence = await createBranchContextFromFile(
			NO_COMMANDS,
			{ slug: PLAN_SLUG, filePath, branchName: TARGET_BRANCH, branchCreation: "graphite" },
			{ cwd: ROOT, context: branchContext({ git, brmem, graphite }) },
		);

		expect(evidence).toMatchObject({
			branch: TARGET_BRANCH,
			branchCreation: "graphite",
			key: PLAN_KEY,
			sourceFile: filePath,
		});
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: ROOT, branch: SOURCE_BRANCH }]);
		expect(git.createBranchAtHeadCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH }]);
		expect(graphite.trackBranchCalls).toEqual([
			{ cwd: ROOT, branch: TARGET_BRANCH, parentBranch: SOURCE_BRANCH },
		]);
		expect(brmem.attachPlanCalls).toMatchObject([
			{
				namespace: BRANCH_CONTEXT_NAMESPACE,
				branch: TARGET_BRANCH,
				key: PLAN_KEY,
				content: "# Plan\n",
			},
		]);
	});

	test("local branch presence failures fail before creating a branch or attaching the plan", async () => {
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			headCommit: START_POINT,
			localBranchPresenceFailures: {
				[TARGET_BRANCH]: { type: "failure" },
			},
		});
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway();
		const filePath = await makePlanFile();

		await expect(
			createBranchContextFromFile(
				NO_COMMANDS,
				{ slug: PLAN_SLUG, filePath, branchName: TARGET_BRANCH, branchCreation: "plain-git" },
				{ cwd: ROOT, context: branchContext({ git, brmem, graphite }) },
			),
		).rejects.toThrow("Could not determine local branch presence.");
		expect(git.localBranchPresenceCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH }]);
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(git.existingBranches).not.toContain(TARGET_BRANCH);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});

	test("untracked Graphite parents fail before creating a branch or attaching the plan", async () => {
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
		});
		const brmem = new InMemoryBranchMemoryGateway();
		const graphite = new InMemoryGraphiteBranchGateway({
			untrackedBranches: [SOURCE_BRANCH],
			untrackedDetail: `ERROR: Cannot perform this operation on untracked branch ${SOURCE_BRANCH}.`,
		});
		const filePath = await makePlanFile();

		await expect(
			createBranchContextFromFile(
				NO_COMMANDS,
				{ slug: PLAN_SLUG, filePath, branchName: TARGET_BRANCH, branchCreation: "graphite" },
				{ cwd: ROOT, context: branchContext({ git, brmem, graphite }) },
			),
		).rejects.toThrow(
			"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
		);
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(git.existingBranches).not.toContain(TARGET_BRANCH);
		expect(graphite.checkBranchTrackedCalls).toEqual([{ cwd: ROOT, branch: SOURCE_BRANCH }]);
		expect(graphite.trackBranchCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});
});

describe("branch-context create formatting", () => {
	test("formats all success evidence fields", () => {
		const text = formatBranchContextEvidence({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			branchCreation: "graphite",
			startPoint: START_POINT,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/branch-contexts---branch-scoped-plan:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: PLAN_FILE,
			summary: "Create the branch.",
		});

		expect(text).toContain("Created branch context and attached plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain(
			`Ref: refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/branch-contexts---branch-scoped-plan:${PLAN_KEY}`,
		);
		expect(text).toContain("Commit: abc123");
		expect(text).toContain(`Source file: ${PLAN_FILE}`);
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Summary: Create the branch.");
	});

	test("formats branch-context failure context with normalized error messages", () => {
		const operation = buildBranchContextCreateOperation({
			slug: PLAN_SLUG,
			filePath: PLAN_FILE,
			branchName: TARGET_BRANCH,
			branchCreation: "graphite",
		});

		const text = formatBranchContextCreateFailure(operation, new Error("branch already exists"));

		expect(text).toContain("Failed to create branch context and attach plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain(`Source file: ${PLAN_FILE}`);
		expect(text).toContain("branch already exists");
	});
});
