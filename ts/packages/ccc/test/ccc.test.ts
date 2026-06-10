import { afterEach, describe, expect, test } from "vitest";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildPlanContentSlugPrompt } from "@asdl/planned-branch";
import { buildSlugModelArgs } from "@asdl/plans";
import registerCccExtension from "../src/ccc.ts";
import { buildGptNanoTextArgs, buildSlugPrompt } from "../src/cmux/branch-slug.ts";
import { registerCccSlotDispatchPromptCommand } from "../src/cmux/dispatch-prompt.ts";
import { registerCccSlotDispatchPlanCommand } from "../src/cmux/slot-dispatch-plan.ts";
import { registerCccSlotOpenBranchCommand } from "../src/cmux/slot-open-branch.ts";
import { createCccSidebarController, registerCccSidebarCommands } from "../src/cmux/sidebar.ts";
import {
	BRANCH,
	FAST_MODEL,
	FakeCommandContext,
	FakePi,
	PLAN_KEY,
	PLAN_SLUG,
	PREVIOUS_MODEL,
	SOURCE_BRANCH,
	START_POINT,
	WORKTREE,
	brmemPutJson,
	dispatchValidationScript,
	gitCurrentBranchStep,
	gitOriginStep,
	gitRootStep,
	headStep,
	isDispatchMutationCommand,
	makeTempDir,
	missingRevisionResult,
	notificationMessages,
	plannedBranchOutputEntry,
	resetCmuxTestEnvironment,
	savedPlanEntry,
	skillCommand,
	slotCheckoutJson,
	step,
	writeCmuxPlanStoreFile,
	writeTempSkill,
} from "./ccc-test-harness.ts";

const SAVED_PLAN_FILENAME_SLUG = "saved-plan-local-locator";
const SAVED_PLAN_FILE_NAME = `${SAVED_PLAN_FILENAME_SLUG}.md`;
const PLAN_CONTENT = "# Plan\n";

afterEach(resetCmuxTestEnvironment);

describe("CCC cmux command suite", () => {
	test("registers the project CCC command suite", () => {
		const pi = new FakePi();

		registerCccExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"ccc:sidebar:objective-summary",
			"ccc:sidebar:pr-summary",
			"ccc:workspace:dispatch-plan",
			"ccc:workspace:dispatch-prompt",
			"ccc:workspace:open-branch",
		]);
	});

	test("ccc:sidebar:pr-summary queues expanded skill prompt and restores the previous model", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const skillPath = await writeTempSkill("Use direct `--description` command shape.");
		const pi = new FakePi({ skillCommands: [skillCommand("ccc-sidebar", skillPath)] });
		const controller = createCccSidebarController(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL, fastModel: FAST_MODEL });

		await pi.commands.get("ccc:sidebar:pr-summary")?.handler("", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("<skill name=\"ccc-sidebar\"");
		expect(pi.sentUserMessages[0]).toContain("Requested variant: PR sidebar.");
		expect(pi.sentUserMessages[0]).toContain("--description");
		expect(pi.setModels).toEqual([FAST_MODEL]);
		expect(pi.thinkingLevels).toEqual(["minimal"]);
		expect(ctx.statuses).toEqual([
			{ key: "pi:ccc-sidebar", value: "preparing cmux sidebar…" },
			{ key: "pi:ccc-sidebar", value: undefined },
		]);

		await pi.emitAgentEnd(ctx);

		expect(pi.setModels).toEqual([FAST_MODEL, PREVIOUS_MODEL]);
		expect(pi.thinkingLevels).toEqual(["minimal", "medium"]);
	});

	test("sidebar fallback uses one-line Goal description and missing workspace skips send", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi();
		const controller = createCccSidebarController(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ccc:sidebar:pr-summary")?.handler("", ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("--description 'Goal: ...'");
		expect(pi.sentUserMessages[0]).not.toContain("State: ...");
		expect(pi.sentUserMessages[0]).not.toContain("--goal");
		expect(pi.sentUserMessages[0]).not.toContain("--status");

		delete process.env.CMUX_WORKSPACE_ID;
		delete process.env.CMUX_TAB_ID;
		const noWorkspace = new FakeCommandContext();
		await pi.commands.get("ccc:sidebar:pr-summary")?.handler("", noWorkspace);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(noWorkspace.notifications.at(-1)?.message).toBe("Not running inside a cmux caller workspace.");
	});

	test("ccc:workspace:open-branch opens explicit branch without queuing sidebar summary", async () => {
		const pi = new FakePi({
			script: [
				step("slot", ["checkout", BRANCH, "--format", "json", "--no-clipboard"], { stdout: slotCheckoutJson(BRANCH) }),
				step("git", ["remote", "get-url", "origin"], { stdout: "git@github.com:owner/repo.git\n" }),
				step("cmux", [
					"new-workspace",
					"--name",
					BRANCH,
					"--description",
					`repo/${BRANCH}`,
					"--cwd",
					WORKTREE,
				], {}),
			],
		});
		registerCccSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ccc:workspace:open-branch")?.handler(BRANCH, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Opened cmux workspace for branch: ${BRANCH}`);
	});

	test("ccc:workspace:open-branch cancels inferred branch without opening workspace", async () => {
		const pi = new FakePi();
		registerCccSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext({ branchEntries: [plannedBranchOutputEntry("feature/latest")] });
		ctx.shouldConfirm = false;

		await pi.commands.get("ccc:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Cancelled; no cmux workspace was opened.");
	});

	test("ccc:workspace:open-branch does not infer from text-only planned branch output", async () => {
		const pi = new FakePi();
		registerCccSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext({
			branchEntries: [
				{
					message: {
						customType: "planned-branch-output",
						content: [
							"Created planned branch and attached plan.",
							"Branch: feature/latest",
							"Key: feature/latest.md",
						].join("\n"),
						details: { status: "success" },
					},
				},
			],
		});

		await pi.commands.get("ccc:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("No latest [planned-branch-output] branch found");
	});

	test("ccc:workspace:dispatch-plan dry-run emits preview without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, { fileName: SAVED_PLAN_FILE_NAME, content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildSlugModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), { stdout: `${PLAN_SLUG}\n` }),
				headStep(),
			],
		});
		registerCccSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({ cwd: repoRoot, branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })] });

		await pi.commands.get("ccc:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "dry-run", targetBranch: PLAN_SLUG, key: PLAN_KEY });
		const content = String(pi.sentMessages[0]?.content);
		expect(content).toContain("Dry run: no branch was created, no plan was attached, and no cmux workspace was opened.");
		expect(content).toContain(`Path: ${planFile}`);
		expect(content).toContain(`Saved-plan filename slug: ${SAVED_PLAN_FILENAME_SLUG}`);
		expect(content).toContain(`Content-derived planned-branch slug: ${PLAN_SLUG}`);
		expect(content).toContain(`Source branch: ${SOURCE_BRANCH}`);
		expect(content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(content).toContain("slot checkout");
		expect(content).toContain("cmux new-workspace");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
	});

	test("ccc:workspace:dispatch-plan full success opens cmux without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, { fileName: SAVED_PLAN_FILE_NAME, content: PLAN_CONTENT });
		const realPlanFile = await realpath(planFile);
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildSlugModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), { stdout: `${PLAN_SLUG}\n` }),
				gitRootStep(repoRoot),
				step("git", ["check-ref-format", "--branch", PLAN_SLUG], {}),
				headStep(),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				step("brmem", ["check", PLAN_KEY, "--namespace", "planned-branch", "--branch", PLAN_SLUG, "--format", "json"], { code: 1 }),
				gitCurrentBranchStep(),
				step("gt", ["info", SOURCE_BRANCH, "--no-interactive"], {}),
				step("git", ["branch", PLAN_SLUG, "HEAD"], {}),
				step("gt", ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("brmem", ["put", PLAN_KEY, "--namespace", "planned-branch", "--branch", PLAN_SLUG, "--file", realPlanFile, "--format", "json"], {
					stdout: brmemPutJson(repoRoot, realPlanFile),
				}),
				step("slot", ["checkout", PLAN_SLUG, "--format", "json", "--no-clipboard"], { stdout: slotCheckoutJson(PLAN_SLUG) }),
				step("git", ["remote", "get-url", "origin"], { stdout: "git@github.com:owner/repo.git\n" }),
				step("cmux", [
					"new-workspace",
					"--name",
					PLAN_SLUG,
					"--description",
					`repo/${PLAN_SLUG}`,
					"--cwd",
					WORKTREE,
					"--command",
					"pi --provider anthropic --model claude-sonnet-4-5 --thinking medium '/planned-branch:impl cmux-summary-hooks.md'",
				], {}),
			],
		});
		registerCccSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			model: PREVIOUS_MODEL,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })],
		});

		await pi.commands.get("ccc:workspace:dispatch-plan")?.handler("", ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "success" });
		expect(notificationMessages(ctx).some((message) => message.includes("Dispatched plan in cmux workspace."))).toBe(true);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("ccc:workspace:dispatch-plan rejects session plan outside local plan store", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const outsidePlanFile = join(outsideDir, PLAN_KEY);
		await writeFile(outsidePlanFile, "# Outside Plan\n", "utf8");
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCccSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({ cwd: repoRoot, branchEntries: [savedPlanEntry(repoRoot, outsidePlanFile)] });

		await pi.commands.get("ccc:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("outside the current local plan store directory");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("ccc:workspace:dispatch-plan rejects wrong repo metadata", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCccSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { repoKey: "gh--other--repo" })],
		});

		await pi.commands.get("ccc:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("repoKey");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("ccc:workspace:dispatch-plan rejects wrong source branch or branch key", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCccSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { sourceBranch: "other-branch", branchKey: "other-branch" })],
		});

		await pi.commands.get("ccc:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("sourceBranch");
		expect(notificationMessages(ctx).join("\n")).toContain("branchKey");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("ccc:workspace:dispatch-prompt opens cmux without sidebar summary", async () => {
		const promptDir = await makeTempDir();
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step("pi", buildGptNanoTextArgs(buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" })), { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("slot", ["checkout", BRANCH, "--format", "json", "--no-clipboard"], { stdout: slotCheckoutJson(BRANCH) }),
				step("git", ["remote", "get-url", "origin"], { stdout: "git@github.com:owner/repo.git\n" }),
				step("cmux", [
					"new-workspace",
					"--name",
					BRANCH,
					"--description",
					`repo/${BRANCH}`,
					"--cwd",
					WORKTREE,
					"--command",
					`pi --provider anthropic --model claude-sonnet-4-5 --thinking medium @${join(promptDir, `123-${BRANCH}.md`)}`,
				], {}),
			],
		});
		registerCccSlotDispatchPromptCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("ccc:workspace:dispatch-prompt")?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		const promptText = await readFile(join(promptDir, `123-${BRANCH}.md`), "utf8");
		expect(promptText).toContain("Implement the cmux dispatch flow");
		expect(promptText).toContain("!gt submit -nps --ai");
		expect(notificationMessages(ctx).some((message) => message.includes(`Opened cmux workspace: ${BRANCH}`))).toBe(true);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});
});
