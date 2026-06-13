import { describe, expect, test } from "vitest";

import { NoSavedPlanAvailableError } from "@asdl/plans";

import {
	CREATE_PLANNED_BRANCH_USAGE,
	DEFAULT_FAST_MODEL,
	DEFAULT_PLAN_CONTENT,
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	FakePi,
	IMPL_BRANCH,
	IMPL_PLAN_CONTENT,
	IMPL_REF,
	PLAN_BRANCH_NAMESPACE,
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
	createPlannedBranchOperationFakes,
	createToolContext,
	dirname,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatCreatePlannedBranchPreview,
	formatPlanBranchEvidence,
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
	parseCreatePlannedBranchArgs,
	planSlugExecCall,
	planSlugStep,
	planStoreDirectory,
	plannedBranchEvidence,
	plannedBranchOutputMessageEntry,
	readFile,
	registeredTool,
	registerPlannedBranchExtension,
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
} from "./planned-branch-extension-support.ts";
describe("validatePlanSlug", () => {
	test("accepts specific 3-7 word kebab slugs", () => {
		for (const slug of [
			"branch-scoped-plan-extension",
			"attached-plan-command",
			"semantic-plan-persistence-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeUndefined();
		}
	});

	test("rejects invalid slug shapes", () => {
		for (const slug of [
			"",
			"Branch-Scoped-Plan",
			"branch scoped plan",
			"branch-scoped-plan.md",
			"attached-plan",
			"one-two-three-four-five-six-seven-eight",
			"implementation-plan-task",
			"branch-2026-plan-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeDefined();
		}
	});
});

describe("source branch plan path helpers", () => {
	test("normalizes repository origin URLs deterministically", () => {
		expect(normalizeRepoOriginUrl("git@github.com:owner/repo.git")).toBe("ssh://git@github.com/owner/repo");
		expect(normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git")).toBe("https://github.com/Owner/Repo");
		expect(normalizeRepoOriginUrl("https://github.com/owner/repo.git///")).toBe("https://github.com/owner/repo");
	});

	test("encodes branch names as one safe path segment", () => {
		expect(encodeBranchForPlanPath("main")).toBe("main");
		expect(encodeBranchForPlanPath("planned-branches/add-widget")).toBe("planned-branches---add-widget");
		expect(encodeBranchForPlanPath("feature/add widget+docs")).toBe("feature---add-widget-docs");
	});

	test("builds GitHub repo plan store repo keys from owner and repo", () => {
		const scpLike = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/repo.git"));
		const https = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("https://github.com/owner/repo.git"));
		const mixedCaseHttps = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git"));
		const different = buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/other.git"));

		expect(scpLike).toBe("gh--owner--repo");
		expect(https).toBe(scpLike);
		expect(mixedCaseHttps).toBe(scpLike);
		expect(different).toBe("gh--owner--other");
	});

	test("builds deterministic non-GitHub fallback plan store repo keys without hashes", () => {
		expect(buildRepoPlanStoreKey("/workspace/repo", normalizeRepoOriginUrl("git@gitlab.com:Owner/Repo.git"))).toBe(
			"ssh-git-gitlab.com-Owner-Repo",
		);
		expect(buildRepoPlanStoreKey("/repo", "/repo")).toBe("repo");
	});

	test("finds the newest saved Markdown plan file", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "planned-branches/add-widget";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "older-source-plan.md", 1_700_000_000_000);
		const newestPath = await writePlanStoreFile(directoryPath, "newer-source-plan.md", 1_800_000_000_000);
		await writePlanStoreFile(directoryPath, "ignored-source-plan.txt", 1_900_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });

		pi.assertDone();
		expect(evidence).toMatchObject({
			slug: "newer-source-plan",
			filePath: newestPath,
			fileName: "newer-source-plan.md",
			repoKey: "gh--owner--repo",
			sourceBranch,
			branchKey: "planned-branches---add-widget",
			directoryPath,
		});
	});

	test("reports a typed error when the local plan store directory is missing", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const promise = findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });
		await expect(promise).rejects.toThrow(/No local plan store directory exists[\s\S]*Create a saved plan first/);
		await expect(promise).rejects.toBeInstanceOf(NoSavedPlanAvailableError);
		await expect(promise).rejects.toMatchObject({ reason: "missing-directory" });
		pi.assertDone();
	});

	test("reports a typed error when no Markdown saved plans exist", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await mkdir(directoryPath, { recursive: true });
		await writeFile(join(directoryPath, "notes.txt"), "not a plan", "utf8");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const promise = findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });
		await expect(promise).rejects.toThrow(/No Markdown saved plan files exist[\s\S]*Create a saved plan first/);
		await expect(promise).rejects.toBeInstanceOf(NoSavedPlanAvailableError);
		await expect(promise).rejects.toMatchObject({ reason: "no-plan-files" });
		pi.assertDone();
	});

	test("treats the latest filename stem as a locator even when it is not a valid branch slug", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "valid-source-plan.md", 1_700_000_000_000);
		const latestPath = await writePlanStoreFile(directoryPath, "bad.md", 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });

		pi.assertDone();
		expect(evidence.slug).toBe("bad");
		expect(evidence.filePath).toBe(latestPath);
	});

	test("tie-breaks exact matching mtimes by filename path", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		await writePlanStoreFile(directoryPath, "alpha-source-plan.md", 1_800_000_000_000);
		const expectedPath = await writePlanStoreFile(directoryPath, "zeta-source-plan.md", 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSavedPlanFile(pi, { cwd: ROOT, planStoreRoot });

		pi.assertDone();
		expect(evidence.slug).toBe("zeta-source-plan");
		expect(evidence.filePath).toBe(expectedPath);
	});

});

describe("planned-branch:create argument parsing", () => {
	test("parses empty args and supported flags", () => {
		expect(parseCreatePlannedBranchArgs("")).toEqual({ help: false, dryRun: false, yes: false });
		expect(parseCreatePlannedBranchArgs("--dry-run --yes --graphite --branch planned-branches/add-widget /tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: true,
			yes: true,
			branchCreation: "graphite",
			branchName: "planned-branches/add-widget",
			filePath: "/tmp/my-source-plan.md",
		});
		expect(parseCreatePlannedBranchArgs("-y --plain-git --branch=planned-branches/add-widget @/tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: false,
			yes: true,
			branchCreation: "plain-git",
			branchName: "planned-branches/add-widget",
			filePath: "@/tmp/my-source-plan.md",
		});
		expect(parseCreatePlannedBranchArgs("--help").help).toBe(true);
		expect(parseCreatePlannedBranchArgs("-h").help).toBe(true);
	});

	test("rejects parse errors before mutation", () => {
		expect(() => parseCreatePlannedBranchArgs("--graphite --plain-git")).toThrow("Cannot pass both");
		expect(() => parseCreatePlannedBranchArgs("--unknown")).toThrow("Unknown flag");
		expect(() => parseCreatePlannedBranchArgs("--branch")).toThrow("Missing value");
		expect(() => parseCreatePlannedBranchArgs("/tmp/one.md /tmp/two.md")).toThrow("at most one");
	});
});

describe("buildWritePlanPrompt", () => {
	test("includes local plan store instructions without branch creation", () => {
		const prompt = buildWritePlanPrompt("add a tiny docs note plan for testing");

		expect(prompt).toContain("/enriched-plan:save request");
		expect(prompt).toContain("add a tiny docs note plan for testing");
		expect(prompt).toContain("write_saved_plan_file");
		expect(prompt).toContain("~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md");
		expect(prompt).toContain("completely fresh downstream implementation session");
		expect(prompt).toContain("self-contained");
		expect(prompt).toContain("Do not rely on this conversation");
		expect(prompt).toContain("Embed all relevant context discovered during planning");
		expect(prompt).toContain("External research/context contract");
		expect(prompt).toContain("web searches");
		expect(prompt).toContain("GitHub issues/PRs");
		expect(prompt).toContain("Do not merely link to external resources");
		expect(prompt).toContain("Do not include secrets");
		expect(prompt).toContain("Recommended saved plan sections");
		expect(prompt).toContain("External/off-repo research context");
		expect(prompt).toContain("Validation commands and expected results");
		expect(prompt).toContain("do not generate or pass a slug");
		expect(prompt).toContain("Codex-backed slug model");
		expect(prompt).toContain('"content": "# Plan');
		expect(prompt).not.toContain('"slug": "semantic-kebab-case-slug"');
		expect(prompt).not.toContain("create_brmem_plan_branch_from_file");
		expect(prompt).not.toContain("branchCreation");
	});

	test("renders empty steering as none", () => {
		expect(buildWritePlanPrompt("   ")).toContain("User steering for this planning request: (none)");
	});

	test("uses custom static prompt body without changing dynamic header", () => {
		const prompt = buildWritePlanPrompt("steer me", "Custom plan body\n");

		expect(prompt).toBe(`This is a /enriched-plan:save request. Write a detailed implementation plan and save it in the local plan store.\n\nUser steering for this planning request:\n\n\`\`\`text\nsteer me\n\`\`\`\n\nCustom plan body\n`);
	});

	test("checked-in write-plan prompt policy is an intentional repo override", async () => {
		const promptPath = join(REPO_ROOT, ".asdl", "prompts", "plans-write.md");
		const checkedInContent = await readFile(promptPath, "utf8");

		expect(checkedInContent).not.toBe(DEFAULT_WRITE_PLAN_PROMPT_BODY);
		expect(DEFAULT_WRITE_PLAN_PROMPT_BODY).not.toContain("Subagent orchestration opportunities:");
		expect(checkedInContent).toContain("Subagent orchestration opportunities:");
		expect(checkedInContent).toContain(
			"`Subagent orchestration opportunities: none` with a one-sentence rationale",
		);
		expect(checkedInContent).toContain("launch-readiness quality bar");
		expect(checkedInContent).toContain("Prefer ordered waves");
		expect(checkedInContent).toContain("recommend sequential dispatch and parent validation");
		expect(checkedInContent).toContain("Subagent model routing:");
		expect(checkedInContent).toContain("For implementation/editing subagents:");
		expect(checkedInContent).toContain(
			"Do not set `dispatch_runner_subagent.model` to a cheap/review model.",
		);
		expect(checkedInContent).toContain("Never reuse review model guidance for implementation");
		expect(checkedInContent).toContain("Closeout review plan:");
		expect(checkedInContent).toContain(
			"exactly one in-session style review subagent per applicable review family",
		);
		expect(checkedInContent).toContain(
			"exclusively for review-only subagents after implementation is complete",
		);
		expect(checkedInContent).toContain("single in-session `typescript-style` review subagent");
		expect(checkedInContent).toContain("single in-session `dignified-python` review subagent");
		expect(checkedInContent).toContain(
			"Do not tell the implementation agent to repeat TypeScript/Python style review subagents",
		);
		expect(checkedInContent).toContain("the final PR review is the final style/quality checkstep");
		expect(checkedInContent).not.toContain(
			"repeat the relevant in-session review subagent after easy fixes",
		);
		expect(checkedInContent).toContain("dispatch_runner_subagent.model");
		expect(checkedInContent).toContain("default_model");
		expect(checkedInContent).toContain("openai-codex/gpt-5.4-mini:medium");
	});
});

describe("buildWriteGrilledPlanPrompt", () => {
	test("includes structured grill requirements and save/no-save contract", () => {
		const prompt = buildWriteGrilledPlanPrompt("plan the grilled command variant");

		expect(prompt).toContain("/enriched-plan:grill-and-save");
		expect(prompt).toContain("plan the grilled command variant");
		expect(prompt).toContain("write_saved_plan_file");
		expect(prompt).toContain("grill_ask");
		expect(prompt).toContain("3–7");
		expect(prompt).toContain("Inspect repository evidence before asking");
		expect(prompt).toContain("If grill_ask is unavailable");
		expect(prompt).toContain("ui_unavailable");
		expect(prompt).toContain("status_request");
		expect(prompt).toContain("end_grill");
		expect(prompt).toContain("do not call write_saved_plan_file");
		expect(prompt).toContain("material requirements remain unresolved");
		expect(prompt).toContain("do not save");
		expect(prompt).toContain("Do not include a full Q&A transcript or special Q&A section");
		expect(prompt).toContain("Do not create a branch or write Branch Memory");
		expect(prompt).not.toContain("GRILL_UI_CONTRACT");
	});

	test("renders empty steering as none", () => {
		expect(buildWriteGrilledPlanPrompt("   ")).toContain("User steering for this planning request: (none)");
	});
});

describe("formatCreatePlannedBranchPreview", () => {
	test("reports latest saved plan and target details", () => {
		const text = formatCreatePlannedBranchPreview({
			mode: "latest",
			slug: PLAN_SLUG,
			savedPlanFileStem: "local-filename-plan",
			filePath: `/plans/gh--owner--repo/main/local-filename-plan.md`,
			fileName: "local-filename-plan.md",
			targetBranch: TARGET_BRANCH,
			branchCreation: "graphite",
			slugEvidence: contentSlugEvidence(),
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "main",
			branchKey: "main",
			modifiedTimeMs: 1_800_000_000_000,
		});

		expect(text).toContain("Latest saved plan from local plan store:");
		expect(text).toContain("Path: /plans/gh--owner--repo/main/local-filename-plan.md");
		expect(text).toContain("Saved-plan file stem: local-filename-plan");
		expect(text).toContain(`Content-derived slug: ${PLAN_SLUG}`);
		expect(text).toContain(`Slug model: ${DEFAULT_FAST_MODEL.provider}/${DEFAULT_FAST_MODEL.modelId}`);
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain("Modified: 2027-01-15T08:00:00.000Z");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Branch Memory key: ${PLAN_KEY}`);
	});

	test("reports session-derived latest saved plan", () => {
		const text = formatCreatePlannedBranchPreview({
			mode: "session",
			slug: PLAN_SLUG,
			savedPlanFileStem: "session-file-plan",
			filePath: `/plans/gh--owner--repo/main/session-file-plan.md`,
			fileName: "session-file-plan.md",
			targetBranch: TARGET_BRANCH,
			branchCreation: "plain-git",
			slugEvidence: contentSlugEvidence(),
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "main",
			branchKey: "main",
			modifiedTimeMs: 1_800_000_000_000,
		});

		expect(text).toContain("Saved plan from current session:");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain("Source branch: main");
		expect(text).toContain("Modified: 2027-01-15T08:00:00.000Z");
	});
});

describe("formatPlanBranchEvidence", () => {
	test("reports all created branch and Branch Memory evidence", () => {
		const text = formatPlanBranchEvidence({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			branchCreation: "graphite",
			startPoint: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---wire-create-planned-branch-command:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: "/tmp/plan.md",
			summary: "Plan the branch-creating flow.",
		});

		expect(text).toContain("Created branch context and attached plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain("Ref: refs/brmem/ns/branch-context/planned-branches---wire-create-planned-branch-command");
		expect(text).toContain("Commit: abc123");
		expect(text).toContain("Source file: /tmp/plan.md");
		expect(text).toContain("Summary: Plan the branch-creating flow.");
	});
});

describe("formatSavedPlanFileEvidence", () => {
	test("reports all local plan store evidence", () => {
		const text = formatSavedPlanFileEvidence({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "planned-branches/add-widget",
			branchKey: "planned-branches---add-widget",
			filePath: "/plans/gh--owner--repo/planned-branches---add-widget/branch-scoped-plan-extension.md",
			summary: "Plan the local plan store file.",
		});

		expect(text).toContain("Saved plan file in local plan store.");
		expect(text).toContain("Path: /plans/gh--owner--repo/planned-branches---add-widget/branch-scoped-plan-extension.md");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain(`Repo root: ${ROOT}`);
		expect(text).toContain("Repo identity source: origin-url");
		expect(text).toContain("Source branch: planned-branches/add-widget");
		expect(text).toContain("Branch path segment: planned-branches---add-widget");
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Summary: Plan the local plan store file.");
	});
});

describe("isPathInside", () => {
	test("handles sibling prefixes correctly", () => {
		expect(isPathInside("/repo", "/repo/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo/nested/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo-other/file.md")).toBe(false);
		expect(isPathInside("/repo", "/repo2/file.md")).toBe(false);
	});
});

describe("normalizePlanFilePath", () => {
	test("strips leading @ and expands current-user home shorthand", () => {
		const scenarioPath = join(homedir(), ".claude", "plans", "where-would-we-host-mossy-lampson.md");

		expect(normalizePlanFilePath("@/tmp/my-source-plan.md")).toBe("/tmp/my-source-plan.md");
		expect(normalizePlanFilePath("~")).toBe(homedir());
		expect(normalizePlanFilePath("~/.claude/plans/where-would-we-host-mossy-lampson.md")).toBe(scenarioPath);
		expect(normalizePlanFilePath("@~/.claude/plans/where-would-we-host-mossy-lampson.md")).toBe(scenarioPath);
		expect(normalizePlanFilePath("relative-source-plan.md")).toBe("relative-source-plan.md");
	});
});

