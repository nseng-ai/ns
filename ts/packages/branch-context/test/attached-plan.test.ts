import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildImplBranchContextPrompt,
	loadAttachedPlan,
	loadBranchContextPlan,
	normalizeRequestedBranchContextKey,
	selectAttachedPlanKey,
} from "../src/attached-plan.ts";
import type { AttachedPlanEntry } from "../src/branch-memory.ts";
import { BRANCH_CONTEXT_NAMESPACE, type BranchContextContext } from "@sdl/branch-context";
import type { CommandExecApi } from "@sdl/core/exec";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { buildPlanFileName, buildRepoPlanStoreKey, encodeBranchForPlanPath } from "@sdl/plans";
import { InMemoryBranchMemoryGateway } from "./support/in-memory-brmem-gateway.ts";
import { InMemoryBranchContextGraphiteGateway } from "./support/in-memory-graphite-gateway.ts";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_BRANCH = `branch-contexts/${PLAN_SLUG}`;
const PLAN_KEY = `${PLAN_SLUG}.md`;
const LEGACY_PLAN_KEY = "plan.md";
const PLAN_REF = `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${PLAN_BRANCH.replaceAll("/", "---")}:${PLAN_KEY}`;
const PLAN_CONTENT = "# Attached Plan\n\n- Preserve all Markdown.\n- Then implement.\n";
const tempDirs: string[] = [];

const NO_COMMANDS: CommandExecApi = {
	async exec() {
		throw new Error("unexpected command execution");
	},
};

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function branchContext(overrides: Partial<BranchContextContext> = {}): BranchContextContext {
	return {
		commands: NO_COMMANDS,
		git: new InMemoryGitGateway({ currentBranch: PLAN_BRANCH, trunkBranch: "main" }),
		brmem: new InMemoryBranchMemoryGateway({
			entries: [{ branch: PLAN_BRANCH, key: PLAN_KEY, content: PLAN_CONTENT }],
		}),
		graphite: new InMemoryBranchContextGraphiteGateway(),
		...overrides,
	};
}

function attachedPlanEntry(key: string, branch: string = PLAN_BRANCH): AttachedPlanEntry {
	return {
		namespace: BRANCH_CONTEXT_NAMESPACE,
		key,
		branch,
		refName: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${key}`,
	};
}

describe("loadAttachedPlan", () => {
	test("loads the branch-segment attached plan and preserves full content", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: PLAN_BRANCH, key: PLAN_KEY, content: PLAN_CONTENT }],
		});

		const plan = await loadAttachedPlan({}, { cwd: ROOT, context: branchContext({ brmem }) });

		expect(brmem.listAttachedPlansCalls).toEqual([{ branch: PLAN_BRANCH }]);
		expect(brmem.getAttachedPlanCalls).toEqual([{ branch: PLAN_BRANCH, key: PLAN_KEY }]);
		expect(plan).toEqual({
			branch: PLAN_BRANCH,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selectedKey: PLAN_KEY,
			refName: PLAN_REF,
			content: PLAN_CONTENT,
			byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
			availableKeys: [PLAN_KEY],
			source: "attached",
		});
	});

	test("rejects a single legacy plan.md entry without loading it", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: PLAN_BRANCH, key: LEGACY_PLAN_KEY, content: PLAN_CONTENT }],
		});

		await expect(
			loadAttachedPlan({}, { cwd: ROOT, context: branchContext({ brmem }) }),
		).rejects.toThrow(/No supported branch-context plan entries[\s\S]*plan\.md/);
		expect(brmem.getAttachedPlanCalls).toEqual([]);
	});

	test("auto-selection ignores legacy plan.md when one supported plan exists", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [
				{ branch: PLAN_BRANCH, key: LEGACY_PLAN_KEY, content: "legacy" },
				{ branch: PLAN_BRANCH, key: PLAN_KEY, content: PLAN_CONTENT },
			],
		});

		const plan = await loadAttachedPlan({}, { cwd: ROOT, context: branchContext({ brmem }) });

		expect(plan.selectedKey).toBe(PLAN_KEY);
		expect(plan.availableKeys).toEqual([PLAN_KEY, LEGACY_PLAN_KEY]);
	});

	test("loads an explicit exact key", async () => {
		const exactPlan = await loadAttachedPlan(
			{ requestedKey: PLAN_KEY },
			{ cwd: ROOT, context: branchContext() },
		);
		expect(exactPlan.selectedKey).toBe(PLAN_KEY);
	});

	test("reports ambiguous no-key selection with available keys", () => {
		expect(() =>
			selectAttachedPlanKey({
				branch: "branch-contexts/no-match",
				entries: [attachedPlanEntry("beta.md"), attachedPlanEntry("alpha.md")],
			}),
		).toThrow(
			/Multiple supported branch-context plan entries[\s\S]*Pass an explicit named Markdown branch-context key[\s\S]*- alpha\.md[\s\S]*- beta\.md/,
		);
	});

	test("reports missing requested key with available keys", () => {
		expect(() =>
			selectAttachedPlanKey({
				branch: PLAN_BRANCH,
				requestedKey: "missing.md",
				entries: [attachedPlanEntry("alpha.md"), attachedPlanEntry("beta.md")],
			}),
		).toThrow(/Requested branch-context key `missing\.md`[\s\S]*- alpha\.md[\s\S]*- beta\.md/);
	});

	test("rejects invalid requested keys before command selection", () => {
		expect(() => normalizeRequestedBranchContextKey("   ")).toThrow("empty");
		expect(() => normalizeRequestedBranchContextKey("/abs.md")).toThrow("must not start");
		expect(() => normalizeRequestedBranchContextKey("../escape")).toThrow("must not contain");
	});

	test("reports no entries with recovery guidance", async () => {
		const brmem = new InMemoryBranchMemoryGateway();

		await expect(
			loadAttachedPlan({}, { cwd: ROOT, context: branchContext({ brmem }) }),
		).rejects.toThrow(
			/No branch-context entries[\s\S]*enriched-plan exec save[\s\S]*branch-context exec from-plan/,
		);
	});

	test("loads saved-plan fallback content with an injected text reader", async () => {
		const planStoreRoot = await mkdtemp(join(tmpdir(), "branch-context-fallback-"));
		tempDirs.push(planStoreRoot);
		const savedSlug = "saved-plan-fallback-content";
		const fileName = buildPlanFileName(savedSlug);
		const directory = join(
			planStoreRoot,
			buildRepoPlanStoreKey(ROOT, "git@github.com:sdl/sdl-tools.git"),
			encodeBranchForPlanPath(PLAN_BRANCH),
		);
		const filePath = join(directory, fileName);
		await mkdir(directory, { recursive: true });
		await writeFile(filePath, "# Real file should not be read\n", "utf8");
		const fakeContent = "# Injected Saved Plan\n\nUse this reader-supplied content.\n";
		const readPaths: string[] = [];

		const plan = await loadBranchContextPlan(
			NO_COMMANDS,
			{},
			{
				cwd: ROOT,
				context: branchContext({
					git: new InMemoryGitGateway({
						currentBranch: PLAN_BRANCH,
						trunkBranch: "main",
						originUrl: "git@github.com:sdl/sdl-tools.git",
						headCommit: "1111111111111111111111111111111111111111",
					}),
					brmem: new InMemoryBranchMemoryGateway(),
				}),
				planStoreRoot,
				async readTextFile(path) {
					readPaths.push(path);
					return fakeContent;
				},
			},
		);

		expect(readPaths).toEqual([filePath]);
		expect(plan).toEqual({
			branch: PLAN_BRANCH,
			namespace: "local-plan-store",
			selectedKey: fileName,
			refName: filePath,
			content: fakeContent,
			byteCount: new TextEncoder().encode(fakeContent).length,
			availableKeys: [fileName],
			source: "saved",
			sourceFile: filePath,
		});
	});

	test("refuses detached HEAD before Branch Memory reads", async () => {
		const brmem = new InMemoryBranchMemoryGateway({
			entries: [{ branch: PLAN_BRANCH, key: PLAN_KEY, content: PLAN_CONTENT }],
		});

		await expect(
			loadAttachedPlan(
				{},
				{
					cwd: ROOT,
					context: branchContext({
						git: new InMemoryGitGateway({ currentBranch: { type: "detached" } }),
						brmem,
					}),
				},
			),
		).rejects.toThrow("detached HEAD");
		expect(brmem.listAttachedPlansCalls).toEqual([]);
	});

	test("refuses trunk branches before Branch Memory reads", async () => {
		for (const branch of ["main", "master", "develop"]) {
			const brmem = new InMemoryBranchMemoryGateway();
			await expect(
				loadAttachedPlan(
					{},
					{
						cwd: ROOT,
						context: branchContext({
							git: new InMemoryGitGateway({ currentBranch: branch, trunkBranch: branch }),
							brmem,
						}),
					},
				),
			).rejects.toThrow(
				`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`,
			);
			expect(brmem.listAttachedPlansCalls).toEqual([]);
		}
	});
});

describe("buildImplBranchContextPrompt", () => {
	test("includes evidence and untruncated plan content", () => {
		const prompt = buildImplBranchContextPrompt({
			branch: PLAN_BRANCH,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selectedKey: PLAN_KEY,
			refName: PLAN_REF,
			content: PLAN_CONTENT,
			byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
			availableKeys: [PLAN_KEY],
			source: "attached",
		});

		expect(prompt).toContain(
			"The attached branch-context plan has been loaded by the planning-layer reader.",
		);
		expect(prompt).toContain(`Branch: ${PLAN_BRANCH}`);
		expect(prompt).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(prompt).toContain(`Selected key: ${PLAN_KEY}`);
		expect(prompt).toContain(`Ref: ${PLAN_REF}`);
		expect(prompt).toContain(`Bytes: ${new TextEncoder().encode(PLAN_CONTENT).length}`);
		expect(prompt).toContain("Create an implementation checklist");
		expect(prompt).toContain("Do not call `brmem put`, `brmem copy`, `brmem delete`");
		expect(prompt).toContain("## Branch-context plan contract protocol");
		expect(prompt).toContain(
			`----- BEGIN ATTACHED PLAN -----\n${PLAN_CONTENT}\n----- END ATTACHED PLAN -----`,
		);
	});
});
