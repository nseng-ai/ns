import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { BRANCH_CONTEXT_PLAN_KEY } from "@asdl/branch-context";
import { DEFAULT_FAST_MODEL } from "@asdl/plans";
import {
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
	formatCreateBranchContextPreview,
	parseCreateBranchContextArgs,
} from "../src/branch-context-extension.ts";

import {
	PLAN_SLUG,
	REPO_ROOT,
	ROOT,
	TARGET_BRANCH,
	contentSlugEvidence,
} from "./branch-context-extension-support.ts";
describe("branch-context:from-plan argument parsing", () => {
	test("parses empty args and supported flags", () => {
		expect(parseCreateBranchContextArgs("")).toEqual({ help: false, dryRun: false, yes: false });
		expect(parseCreateBranchContextArgs("--dry-run --yes --graphite --branch branch-contexts/add-widget /tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: true,
			yes: true,
			branchCreation: "graphite",
			branchName: "branch-contexts/add-widget",
			filePath: "/tmp/my-source-plan.md",
		});
		expect(parseCreateBranchContextArgs("-y --plain-git --branch=branch-contexts/add-widget @/tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: false,
			yes: true,
			branchCreation: "plain-git",
			branchName: "branch-contexts/add-widget",
			filePath: "@/tmp/my-source-plan.md",
		});
		expect(parseCreateBranchContextArgs("--help").help).toBe(true);
		expect(parseCreateBranchContextArgs("-h").help).toBe(true);
	});

	test("rejects parse errors before mutation", () => {
		expect(() => parseCreateBranchContextArgs("--graphite --plain-git")).toThrow("Cannot pass both");
		expect(() => parseCreateBranchContextArgs("--unknown")).toThrow("Unknown flag");
		expect(() => parseCreateBranchContextArgs("--branch")).toThrow("Missing value");
		expect(() => parseCreateBranchContextArgs("/tmp/one.md /tmp/two.md")).toThrow("at most one");
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
		expect(DEFAULT_WRITE_PLAN_PROMPT_BODY).not.toContain("Implementation checkpoint guidance:");
		expect(DEFAULT_WRITE_PLAN_PROMPT_BODY).not.toContain("/sdl:cp");
		expect(checkedInContent).toContain("Subagent orchestration opportunities:");
		expect(checkedInContent).toContain(
			"`Subagent orchestration opportunities: none` with a one-sentence rationale",
		);
		expect(checkedInContent).toContain("launch-readiness quality bar");
		expect(checkedInContent).toContain("Prefer ordered waves");
		expect(checkedInContent).toContain("recommend sequential dispatch and parent validation");
		expect(checkedInContent).toContain("Implementation checkpoint guidance:");
		expect(checkedInContent).toContain("/sdl:cp");
		expect(checkedInContent).not.toContain("/code:cp");
		expect(checkedInContent).toContain("coherent standalone");
		expect(checkedInContent).toContain("checkpoint ownership");
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
describe("formatCreateBranchContextPreview", () => {
	test("reports latest saved plan and target details", () => {
		const text = formatCreateBranchContextPreview({
			mode: "latest",
			slug: PLAN_SLUG,
			savedPlanFileStem: "local-filename-plan",
			filePath: `/plans/gh--owner--repo/main/local-filename-plan.md`,
			fileName: "local-filename-plan.md",
			targetBranch: TARGET_BRANCH,
			branchCreation: "graphite",
			isExplicitTargetBranch: false,
			slugEvidence: contentSlugEvidence(),
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
		expect(text).toContain(`Branch Memory key: ${BRANCH_CONTEXT_PLAN_KEY}`);
	});

	test("reports session-derived latest saved plan", () => {
		const text = formatCreateBranchContextPreview({
			mode: "session",
			slug: PLAN_SLUG,
			savedPlanFileStem: "session-file-plan",
			filePath: `/plans/gh--owner--repo/main/session-file-plan.md`,
			fileName: "session-file-plan.md",
			targetBranch: TARGET_BRANCH,
			branchCreation: "plain-git",
			isExplicitTargetBranch: false,
			slugEvidence: contentSlugEvidence(),
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
