import { describe, expect, test } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { encodeBranchForPlanPath } from "@sdl/plans";
import { BRANCH_CONTEXT_NAMESPACE } from "../../src/constants.ts";
import {
	PLAN_KEY,
	PLAN_SLUG,
	SOURCE_BRANCH,
	START_POINT,
	jsonFailure,
	makeTempDir,
	parseJson,
	runWithFakes,
	writeSavedPlan,
} from "../support/cli-harness.ts";

describe("branch-context exec", () => {
	test("create makes a plain git branch and attaches the plan in the branch-context namespace", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--summary",
				"Create it",
				"--format",
				"json",
			],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				slug: PLAN_SLUG,
				branch,
				branchCreation: "plain-git",
				startPoint: START_POINT,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: PLAN_KEY,
				sourceFile: planFile,
				summary: "Create it",
			},
		});
		expect(run.brmem.attachmentPresenceCalls).toEqual([{ branch, key: PLAN_KEY }]);
		expect(run.brmem.attachPlanCalls).toMatchObject([
			{ namespace: BRANCH_CONTEXT_NAMESPACE, branch, key: PLAN_KEY, content: "# Plan\n" },
		]);
		expect(run.graphite.checkBranchTrackedCalls).toEqual([]);
		expect(run.graphite.trackBranchCalls).toEqual([]);
		expect(run.brmem.attachedPlans).toContainEqual(
			expect.objectContaining({
				branch,
				key: PLAN_KEY,
				content: "# Plan\n",
			}),
		);
	});

	test("create tracks Graphite branches through the semantic gateway", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--branch-creation",
				"graphite",
				"--format",
				"json",
			],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				slug: PLAN_SLUG,
				branch,
				branchCreation: "graphite",
				startPoint: START_POINT,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: PLAN_KEY,
				sourceFile: planFile,
			},
		});
		expect(run.graphite.checkBranchTrackedCalls).toEqual([
			{ cwd: repoRoot, branch: SOURCE_BRANCH },
		]);
		expect(run.graphite.trackBranchCalls).toEqual([
			{ cwd: repoRoot, branch, parentBranch: SOURCE_BRANCH },
		]);
		expect(run.brmem.attachPlanCalls).toMatchObject([
			{ namespace: BRANCH_CONTEXT_NAMESPACE, branch, key: PLAN_KEY, content: "# Plan\n" },
		]);
	});

	test("untracked Graphite parents fail before creating a branch or attaching Branch Memory", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--branch-creation",
				"graphite",
				"--format",
				"json",
			],
			{
				cwd: repoRoot,
				git: { headCommit: START_POINT },
				graphite: {
					untrackedBranches: [SOURCE_BRANCH],
					untrackedDetail: `ERROR: Cannot perform this operation on untracked branch ${SOURCE_BRANCH}.`,
				},
			},
		);

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		const message = String(payload.message);
		expect(message).toContain(
			"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
		);
		expect(message).toContain(`Parent branch: ${SOURCE_BRANCH}`);
		expect(message).toContain("No branch was created and no plan was attached.");
		expect(message).toContain("ERROR: Cannot perform this operation on untracked branch");
		expect(run.git.existingBranches).not.toContain(branch);
		expect(run.git.createBranchAtHeadCalls).toEqual([]);
		expect(run.graphite.checkBranchTrackedCalls).toEqual([
			{ cwd: repoRoot, branch: SOURCE_BRANCH },
		]);
		expect(run.graphite.trackBranchCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("Graphite tracking failures keep the local branch and skip Branch Memory attach", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--branch-creation",
				"graphite",
				"--format",
				"json",
			],
			{
				cwd: repoRoot,
				git: { headCommit: START_POINT },
				graphite: {
					trackFailure: {
						code: "graphite_track_failed",
						message: "gt track failed (exit code 2).",
					},
				},
			},
		);

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		expect(String(payload.message)).toContain(
			"Created local Git branch but failed to track it with Graphite.",
		);
		expect(String(payload.message)).toContain(`Branch: ${branch}`);
		expect(String(payload.message)).toContain("No attached plan was stored.");
		expect(String(payload.message)).toContain("gt track failed");
		expect(run.git.existingBranches).toContain(branch);
		expect(run.graphite.checkBranchTrackedCalls).toEqual([
			{ cwd: repoRoot, branch: SOURCE_BRANCH },
		]);
		expect(run.graphite.trackBranchCalls).toEqual([
			{ cwd: repoRoot, branch, parentBranch: SOURCE_BRANCH },
		]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("Branch Memory attach failures report partial failure after branch creation", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
				"--slug",
				PLAN_SLUG,
				"--plan-file",
				planFile,
				"--branch",
				branch,
				"--format",
				"json",
			],
			{
				cwd: repoRoot,
				git: { headCommit: START_POINT },
				brmem: {
					attachFailure: {
						code: "brmem_write_failed",
						message: "Branch Memory write failed.",
					},
				},
			},
		);

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		const message = String(payload.message);
		expect(message).toContain(
			"Partial failure: Created branch but failed to attach the plan in Branch Memory.",
		);
		expect(message).toContain(`Created branch: ${branch}`);
		expect(message).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(message).toContain(`Key: ${PLAN_KEY}`);
		expect(message).toContain("No cleanup was attempted; inspect the created branch manually.");
		expect(message).toContain("Branch Memory write failed.");
		expect(run.git.existingBranches).toContain(branch);
		expect(run.brmem.attachPlanCalls).toMatchObject([
			{ namespace: BRANCH_CONTEXT_NAMESPACE, branch, key: PLAN_KEY, content: "# Plan\n" },
		]);
		expect(run.brmem.attachedPlans).toEqual([]);
	});

	test("load JSON is metadata-only by default", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				selectedKey: PLAN_KEY,
				byteCount: content.length,
				source: "attached",
			},
		});
		const data = payload.data as Record<string, unknown>;
		expect(data).not.toHaveProperty("attachedPlanContent");
		expect(data).not.toHaveProperty("implementationPrompt");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ branch, key: PLAN_KEY }]);
	});

	test("load reports Branch Memory list failures", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(["exec", "load", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: {
				listFailure: {
					code: "brmem_list_failed",
					message: "Branch Memory list failed.",
				},
			},
		});

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		expect(String(payload.message)).toContain("Branch Memory list failed.");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([]);
	});

	test("load reports Branch Memory get failures after selecting an attached key", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(["exec", "load", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: {
				entries: [{ branch, key: PLAN_KEY, content: "# Plan\n" }],
				getFailure: {
					code: "brmem_get_failed",
					message: "Branch Memory get failed.",
				},
			},
		});

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		expect(String(payload.message)).toContain("Branch Memory get failed.");
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ branch, key: PLAN_KEY }]);
	});

	test("load falls back to the latest saved source-branch plan when no plan is attached", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planDirectory = join(
			planStoreRoot,
			"gh--owner--repo",
			encodeBranchForPlanPath(SOURCE_BRANCH),
		);
		await mkdir(planDirectory, { recursive: true });
		const planFile = join(planDirectory, PLAN_KEY);
		const content = "# Saved Plan\n\n- Implement directly from the saved plan.\n";
		await writeFile(planFile, content, "utf8");
		const run = runWithFakes(["exec", "load", "--format", "json"], {
			cwd: repoRoot,
			planStoreRoot,
			git: { currentBranch: SOURCE_BRANCH, trunkBranch: "main" },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				branch: SOURCE_BRANCH,
				namespace: "local-plan-store",
				selectedKey: PLAN_KEY,
				refName: planFile,
				byteCount: content.length,
				source: "saved",
				sourceFile: planFile,
			},
		});
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ branch: SOURCE_BRANCH }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([]);
	});

	test("load writes the implementation prompt to a file for bounded JSON output", async () => {
		const repoRoot = await makeTempDir();
		const promptFile = join(await makeTempDir(), "implementation-prompt.md");
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(["exec", "load", "--prompt-file", promptFile, "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				selectedKey: PLAN_KEY,
				source: "attached",
				implementationPromptFile: promptFile,
			},
		});
		const data = payload.data as Record<string, unknown>;
		expect(data).not.toHaveProperty("attachedPlanContent");
		expect(data).not.toHaveProperty("implementationPrompt");
		const prompt = await readFile(promptFile, "utf8");
		expect(prompt).toContain("# branch-context implementation");
		expect(prompt).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");
	});

	test("load can include large JSON fields explicitly", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const run = runWithFakes(
			["exec", "load", "--include-content", "--include-prompt", "--format", "json"],
			{
				cwd: repoRoot,
				git: { currentBranch: branch, trunkBranch: "main" },
				brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
			},
		);

		expect(await run.exit).toBe(0);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				selectedKey: PLAN_KEY,
				byteCount: content.length,
				source: "attached",
				attachedPlanContent: content,
			},
		});
		const data = payload.data as Record<string, unknown>;
		expect(String(data.implementationPrompt)).toContain("# branch-context implementation");
		expect(String(data.implementationPrompt)).toContain(
			"----- BEGIN ATTACHED PLAN -----\n# Attached Plan",
		);
		expect(run.brmem.listAttachedPlansCalls).toEqual([{ branch }]);
		expect(run.brmem.getAttachedPlanCalls).toEqual([{ branch, key: PLAN_KEY }]);
	});

	test("load accepts JSON-only include flags in human mode without changing output", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n\n- Implement from this.\n";
		const fakes = {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		};
		const withFlags = runWithFakes(
			["exec", "load", "--include-content", "--include-prompt"],
			fakes,
		);
		expect(await withFlags.exit).toBe(0);
		expect(withFlags.stderr.join("")).toBe("");
		expect(withFlags.stdout.join("")).toContain(`Selected key: ${PLAN_KEY}`);
		expect(withFlags.stdout.join("")).toContain("----- BEGIN ATTACHED PLAN -----\n# Attached Plan");

		const withoutFlags = runWithFakes(["exec", "load"], fakes);
		expect(await withoutFlags.exit).toBe(0);
		expect(withoutFlags.stdout.join("")).toBe(withFlags.stdout.join(""));
		// PINNED CLINKR SEMANTICS (behavior change): --include-content/--include-prompt
		// no longer require --format json; they are accepted and ignored in human mode.
	});

	test("attach stores an arbitrary file under an exact plan key", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const sourceFile = join(outsideDir, "notes.md");
		await writeFile(sourceFile, "# Notes\n", "utf8");
		const branch = "branch-contexts/manual-context";
		const key = "manual-notes-plan.md";
		const run = runWithFakes(["exec", "attach", key, "--file", sourceFile, "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key,
				sourceFile: sourceFile,
			},
		});
		expect(run.brmem.attachPlanCalls).toMatchObject([
			{ namespace: BRANCH_CONTEXT_NAMESPACE, branch, key, content: "# Notes\n" },
		]);
	});

	test("attach --plan stores a saved plan as a named key and reports the plan slug", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const sourceFile = await writeSavedPlan(planStoreRoot);
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--format", "json"], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot, currentBranch: branch },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: PLAN_KEY,
				sourceFile: sourceFile,
				planSlug: PLAN_SLUG,
			},
		});
		expect(run.brmem.attachmentPresenceCalls).toEqual([{ branch, key: PLAN_KEY }]);
		expect(run.brmem.attachPlanCalls).toMatchObject([
			{ namespace: BRANCH_CONTEXT_NAMESPACE, branch, key: PLAN_KEY, content: "# Saved Plan\n" },
		]);
	});

	test("attach --plan rejects key and file arguments", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const sourceFile = join(outsideDir, "notes.md");
		await writeFile(sourceFile, "# Notes\n", "utf8");
		const message = "Pass either --plan <slug> or <key> --file <path>, not both.";
		const run = runWithFakes(
			["exec", "attach", "notes", "--file", sourceFile, "--plan", PLAN_SLUG, "--format", "json"],
			{ cwd: repoRoot },
		);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure(message));
		expect(run.stderr.join("")).toBe("");
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach --plan reports missing slugs with available slugs", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		await writeSavedPlan(planStoreRoot, { slug: "available-plan" });
		const run = runWithFakes(["exec", "attach", "--plan", "missing-plan", "--format", "json"], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		const message = String(payload.message);
		expect(message).toContain("No saved plan found for slug `missing-plan`.");
		expect(message).toContain("Available slugs:");
		expect(message).toContain("- available-plan");
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach --plan reports duplicate slug matches", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const first = await writeSavedPlan(planStoreRoot, { branch: "feature/one" });
		const second = await writeSavedPlan(planStoreRoot, { branch: "feature/two" });
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--format", "json"], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		const message = String(payload.message);
		expect(message).toContain(
			`Multiple saved plans found for slug \`${PLAN_SLUG}\`; choose a file explicitly.`,
		);
		expect(message).toContain(first);
		expect(message).toContain(second);
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach reports missing source arguments", async () => {
		const repoRoot = await makeTempDir();
		const message = "Attach requires either --plan <slug> or <key> --file <path>.";
		const run = runWithFakes(["exec", "attach", "--format", "json"], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure(message));
		expect(run.stderr.join("")).toBe("");
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("attach --plan honors --branch without requiring a current branch", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const sourceFile = await writeSavedPlan(planStoreRoot);
		const branch = "branch-contexts/override";
		const run = runWithFakes(
			["exec", "attach", "--plan", PLAN_SLUG, "--branch", branch, "--format", "json"],
			{
				cwd: repoRoot,
				planStoreRoot,
				git: { repoRoot, currentBranch: { type: "detached" } },
			},
		);

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				key: PLAN_KEY,
				sourceFile: sourceFile,
				planSlug: PLAN_SLUG,
			},
		});
		expect(run.git.currentBranchCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toMatchObject([
			{ namespace: BRANCH_CONTEXT_NAMESPACE, branch, key: PLAN_KEY, content: "# Saved Plan\n" },
		]);
	});

	test("attach --plan fails on detached HEAD without --branch", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		await writeSavedPlan(planStoreRoot);
		const run = runWithFakes(["exec", "attach", "--plan", PLAN_SLUG, "--format", "json"], {
			cwd: repoRoot,
			planStoreRoot,
			git: { repoRoot, currentBranch: { type: "detached" } },
		});

		expect(await run.exit).toBe(2);
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		expect(String(payload.message)).toContain(
			"Cannot default branch-context operation from detached HEAD. Pass --branch explicitly.",
		);
		expect(run.brmem.attachmentPresenceCalls).toEqual([]);
		expect(run.brmem.attachPlanCalls).toEqual([]);
	});

	test("list labels Markdown plan entries without making plan.md canonical", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "list"], {
			cwd: repoRoot,
			git: { currentBranch: branch },
			brmem: {
				entries: [
					{ branch, key: PLAN_KEY },
					{ branch, key: "plan.md" },
					{ branch, key: "notes" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain(`- ${PLAN_KEY} (plan)`);
		expect(run.stdout.join("")).toContain("- plan.md (unsupported legacy plan key)");
		expect(run.stdout.join("")).toContain("- notes");
	});

	test("check reports Branch Memory presence failures", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "check", "missing", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch },
			brmem: {
				presenceFailure: {
					code: "brmem_check_failed",
					message: "Branch Memory check failed.",
				},
			},
		});

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		expect(String(payload.message)).toContain("Branch Memory check failed.");
		expect(run.brmem.attachmentPresenceCalls).toEqual([{ branch, key: "missing" }]);
	});

	test("check exits successfully for absent entries", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "check", "missing", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: "missing",
				present: false,
			},
		});
	});

	test("delete reports Branch Memory delete failures", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "delete", "notes", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch },
			brmem: {
				entries: [{ branch, key: "notes" }],
				deleteFailure: {
					code: "brmem_delete_failed",
					message: "Branch Memory delete failed.",
				},
			},
		});

		expect(await run.exit).toBe(2);
		run.commands.assertDone();
		const payload = parseJson(run);
		expect(payload).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "branch-context-error",
		});
		expect(String(payload.message)).toContain("Branch Memory delete failed.");
		expect(run.brmem.deleteEntryCalls).toEqual([{ branch, key: "notes" }]);
		expect(run.brmem.attachedPlans).toContainEqual(
			expect.objectContaining({ branch, key: "notes" }),
		);
	});

	test("delete removes an explicit branch-context key", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/manual-context";
		const run = runWithFakes(["exec", "delete", "notes", "--format", "json"], {
			cwd: repoRoot,
			git: { currentBranch: branch },
			brmem: { entries: [{ branch, key: "notes" }] },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			exitCode: 0,
			data: {
				branch,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: "notes",
				deleted: true,
			},
		});
		expect(run.brmem.deleteEntryCalls).toEqual([{ branch, key: "notes" }]);
	});
});
