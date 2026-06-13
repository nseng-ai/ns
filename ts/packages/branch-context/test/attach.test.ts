import { afterEach, describe, expect, test } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CommandExecApi } from "@asdl/core/exec";
import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { createTempDirTracker } from "@asdl/core/testing";
import { encodeBranchForPlanPath } from "@asdl/plans";

import { attachBranchContextEntry } from "../src/attach.ts";
import { BRANCH_CONTEXT_NAMESPACE, BRANCH_CONTEXT_PLAN_KEY } from "../src/constants.ts";
import type { BranchContextContext } from "../src/context.ts";
import { InMemoryBranchContextBrmemGateway } from "./support/in-memory-brmem-gateway.ts";
import { InMemoryBranchContextGraphiteGateway } from "./support/in-memory-graphite-gateway.ts";

const ROOT = "/repo";
const SOURCE_BRANCH = "feature/source-plan";
const TARGET_BRANCH = "branch-contexts/manual-context";
const PLAN_SLUG = "branch-scoped-plan";
const REPO_KEY = "gh--owner--repo";

const NO_COMMANDS: CommandExecApi = {
	async exec() {
		throw new Error("unexpected command execution");
	},
};

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

function branchContext(overrides: Pick<BranchContextContext, "git" | "brmem">): BranchContextContext {
	return {
		commands: NO_COMMANDS,
		git: overrides.git,
		brmem: overrides.brmem,
		graphite: new InMemoryBranchContextGraphiteGateway(),
	};
}

async function makePlanStore(): Promise<string> {
	return tempDirs.makeTempDir("branch-context-attach-store-");
}

async function writeSavedPlan(
	planStoreRoot: string,
	params: { slug?: string | undefined; branch?: string | undefined; content?: string | undefined } = {},
): Promise<string> {
	const slug = params.slug ?? PLAN_SLUG;
	const branch = params.branch ?? SOURCE_BRANCH;
	const planDirectory = join(planStoreRoot, REPO_KEY, encodeBranchForPlanPath(branch));
	await mkdir(planDirectory, { recursive: true });
	const filePath = join(planDirectory, `${slug}.md`);
	await writeFile(filePath, params.content ?? "# Saved Plan\n", "utf8");
	return filePath;
}

describe("attachBranchContextEntry", () => {
	test("attaches a saved plan as the canonical plan key and preserves the plan slug", async () => {
		const planStoreRoot = await makePlanStore();
		const sourceFile = await writeSavedPlan(planStoreRoot);
		const git = new InMemoryGitGateway({ repoRoot: ROOT, currentBranch: TARGET_BRANCH });
		const brmem = new InMemoryBranchContextBrmemGateway();

		const evidence = await attachBranchContextEntry(NO_COMMANDS, { planSlug: PLAN_SLUG }, { cwd: ROOT, context: branchContext({ git, brmem }), planStoreRoot });

		expect(evidence).toMatchObject({
			branch: TARGET_BRANCH,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: BRANCH_CONTEXT_PLAN_KEY,
			sourceFile,
			planSlug: PLAN_SLUG,
		});
		expect(brmem.attachmentPresenceCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH, key: BRANCH_CONTEXT_PLAN_KEY }]);
		expect(brmem.attachPlanCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH, key: BRANCH_CONTEXT_PLAN_KEY, sourceFile }]);
	});

	test("rejects a missing saved-plan slug with available slugs from one store listing", async () => {
		const planStoreRoot = await makePlanStore();
		await writeSavedPlan(planStoreRoot, { slug: "available-plan" });
		const git = new InMemoryGitGateway({ repoRoot: ROOT, currentBranch: TARGET_BRANCH });
		const brmem = new InMemoryBranchContextBrmemGateway();

		await expect(attachBranchContextEntry(NO_COMMANDS, { planSlug: "missing-plan" }, { cwd: ROOT, context: branchContext({ git, brmem }), planStoreRoot })).rejects.toThrow(
			/No saved plan found for slug `missing-plan`\.[\s\S]*Available slugs:[\s\S]*- available-plan/,
		);
		expect(git.repoRootCalls).toEqual([{ cwd: ROOT }]);
		expect(git.originUrlCalls).toEqual([{ cwd: ROOT }]);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});

	test("rejects duplicate saved-plan slug matches", async () => {
		const planStoreRoot = await makePlanStore();
		const first = await writeSavedPlan(planStoreRoot, { branch: "feature/one" });
		const second = await writeSavedPlan(planStoreRoot, { branch: "feature/two" });
		const git = new InMemoryGitGateway({ repoRoot: ROOT, currentBranch: TARGET_BRANCH });
		const brmem = new InMemoryBranchContextBrmemGateway();

		const error = await attachBranchContextEntry(NO_COMMANDS, { planSlug: PLAN_SLUG }, { cwd: ROOT, context: branchContext({ git, brmem }), planStoreRoot }).then(
			() => undefined,
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(Error);
		const message = error instanceof Error ? error.message : "";
		expect(message).toContain(`Multiple saved plans found for slug \`${PLAN_SLUG}\`; choose a file explicitly.`);
		expect(message).toContain(first);
		expect(message).toContain(second);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});

	test("honors an explicit branch without consulting the current checkout", async () => {
		const planStoreRoot = await makePlanStore();
		const sourceFile = await writeSavedPlan(planStoreRoot);
		const git = new InMemoryGitGateway({ repoRoot: ROOT, currentBranch: { type: "detached" } });
		const brmem = new InMemoryBranchContextBrmemGateway();

		const evidence = await attachBranchContextEntry(NO_COMMANDS, { planSlug: PLAN_SLUG, branch: TARGET_BRANCH }, { cwd: ROOT, context: branchContext({ git, brmem }), planStoreRoot });

		expect(evidence.branch).toBe(TARGET_BRANCH);
		expect(git.currentBranchCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([{ cwd: ROOT, branch: TARGET_BRANCH, key: BRANCH_CONTEXT_PLAN_KEY, sourceFile }]);
	});

	test("fails from detached HEAD when no branch override is supplied", async () => {
		const planStoreRoot = await makePlanStore();
		await writeSavedPlan(planStoreRoot);
		const git = new InMemoryGitGateway({ repoRoot: ROOT, currentBranch: { type: "detached" } });
		const brmem = new InMemoryBranchContextBrmemGateway();

		await expect(attachBranchContextEntry(NO_COMMANDS, { planSlug: PLAN_SLUG }, { cwd: ROOT, context: branchContext({ git, brmem }), planStoreRoot })).rejects.toThrow(
			"Cannot default branch-context operation from detached HEAD. Pass --branch explicitly.",
		);
		expect(brmem.attachmentPresenceCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
	});
});
