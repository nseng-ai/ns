import { describe, expect, test } from "vitest";

import {
	CREATE_BRANCH_CONTEXT_USAGE,
	DEFAULT_FAST_MODEL,
	DEFAULT_PLAN_CONTENT,
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	FakePi,
	IMPL_BRANCH,
	IMPL_PLAN_CONTENT,
	IMPL_REF,
	BRANCH_CONTEXT_NAMESPACE,
	PLAN_KEY,
	PLAN_SLUG,
	REPO_ROOT,
	ROOT,
	SOURCE_BRANCH,
	START_POINT,
	TARGET_BRANCH,
	attachedPlan,
	buildPlanContentSlugPrompt,
	buildRepoPlanStoreKey,
	buildSavedPlanContentSlugPrompt,
	buildSlugModelArgs,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
	contentSlugEvidence,
	createContext,
	createBranchContextOperationFakes,
	createToolContext,
	dirname,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatCreateBranchContextPreview,
	formatBranchContextEvidence,
	formatSavedPlanFileEvidence,
	gitCheckoutStep,
	gitCurrentBranchStep,
	gitOriginStep,
	gitRootStep,
	homedir,
	isPathInside,
	join,
	makeNamedPlanFile,
	makeTempDir,
	mkdir,
	normalizePlanFilePath,
	normalizeRepoOriginUrl,
	parseCreateBranchContextArgs,
	planSlugExecCall,
	planSlugStep,
	planStoreDirectory,
	branchContextEvidence,
	branchContextOutputMessageEntry,
	readFile,
	registeredTool,
	registerBranchContextExtension,
	resolve,
	resolveWritePlanPromptStep,
	savedPlanFileContent,
	savedPlanSlugArgs,
	savedPlanSlugStep,
	sourcePlanEvidence,
	sourcePlanToolResultEntry,
	validatePlanSlug,
	writeFile,
	writePlanStoreFile,
	writeSavedPlanFile,
	type ToolUpdate,
} from "./branch-context-extension-support.ts";
describe("writeSavedPlanFile", () => {
	test("writes a source branch saved plan file with origin identity evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "branch-contextes/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ stdout: `${origin}\n` })]);

		const evidence = await writeSavedPlanFile(
			pi,
			{
				slug: PLAN_SLUG,
				content: "# Test Plan\n\nDo the work.\n",
				summary: "Plan the local plan store file.",
			},
			{ cwd: ROOT, planStoreRoot },
		);

		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const expectedPath = join(planStoreRoot, repoKey, branchKey, `${PLAN_SLUG}.md`);

		pi.assertDone();
		expect(evidence).toEqual({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey,
			repoIdentitySource: "origin-url",
			sourceBranch,
			branchKey,
			filePath: expectedPath,
			summary: "Plan the local plan store file.",
		});
		expect(await readFile(expectedPath, "utf8")).toBe("# Test Plan\n\nDo the work.\n");
	});

	test("falls back to real repo root identity when origin is absent", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ code: 1, stderr: "no origin" })]);

		const evidence = await writeSavedPlanFile(
			pi,
			{ slug: PLAN_SLUG, content: "# Test Plan\n" },
			{ cwd: ROOT, planStoreRoot },
		);

		pi.assertDone();
		expect(evidence.repoIdentitySource).toBe("repo-root");
		expect(evidence.repoKey).toBe(buildRepoPlanStoreKey(ROOT, ROOT));
		expect(await readFile(evidence.filePath, "utf8")).toBe("# Test Plan\n");
	});

	test("refuses to overwrite an existing local plan store file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "branch-contextes/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const repoKey = buildRepoPlanStoreKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const filePath = join(planStoreRoot, repoKey, branchKey, `${PLAN_SLUG}.md`);
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, "# Existing Plan\n", "utf8");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ stdout: `${origin}\n` })]);

		await expect(
			writeSavedPlanFile(pi, { slug: PLAN_SLUG, content: "# New Plan\n" }, { cwd: ROOT, planStoreRoot }),
		).rejects.toThrow("refusing to overwrite");

		pi.assertDone();
		expect(await readFile(filePath, "utf8")).toBe("# Existing Plan\n");
	});

	test("rejects invalid slug before git commands or filesystem writes", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const pi = new FakePi();

		await expect(
			writeSavedPlanFile(pi, { slug: "Bad Slug", content: "# Test Plan\n" }, { cwd: ROOT, planStoreRoot }),
		).rejects.toThrow("Invalid saved plan slug");
		expect(pi.execCalls).toEqual([]);
	});

	test("rejects detached HEAD with a clear named-branch message", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep("", { stdout: "\n" })]);

		await expect(
			writeSavedPlanFile(pi, { slug: PLAN_SLUG, content: "# Test Plan\n" }, { cwd: ROOT, planStoreRoot }),
		).rejects.toThrow("check out a named branch");

		pi.assertDone();
	});
});
