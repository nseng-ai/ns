import { afterEach, describe, expect, test } from "vitest";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildPlanContentSlugPrompt, formatImplBranchContextCommand } from "@asdl/branch-context";
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
	SAVED_PLAN_FILENAME,
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
	branchContextOutputEntry,
	resetCmuxTestEnvironment,
	savedPlanEntry,
	skillCommand,
	slotCheckoutJson,
	step,
	writeCmuxPlanStoreFile,
} from "./ccc-test-harness.ts";

const SAVED_PLAN_FILENAME_SLUG = "saved-plan-local-locator";
const SAVED_PLAN_FILE_NAME = `${SAVED_PLAN_FILENAME_SLUG}.md`;
const PLAN_CONTENT = "# Plan\n";
const DISPATCH_PROMPT_NAMESPACE = "ccc-dispatch";
const DISPATCH_PROMPT_KEY = "prompt.md";

function dispatchPromptPutJson(sourceFile: string): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: DISPATCH_PROMPT_NAMESPACE,
			key: DISPATCH_PROMPT_KEY,
			branch: BRANCH,
			ref_name: `refs/brmem/ns/${DISPATCH_PROMPT_NAMESPACE}/${BRANCH}:${DISPATCH_PROMPT_KEY}`,
			commit: START_POINT,
			source_file: sourceFile,
		},
	});
}

afterEach(resetCmuxTestEnvironment);

describe("CCC cmux command suite", () => {
	test("registers the project CCC command suite", () => {
		const pi = new FakePi();

		registerCccExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"ccc:claude-plan-tab",
			"ccc:sidebar:objective-summary",
			"ccc:sidebar:pr-summary",
			"ccc:workspace:dispatch-plan",
			"ccc:workspace:dispatch-prompt",
			"ccc:workspace:open-branch",
		]);
	});

	test("ccc:sidebar:pr-summary queues expanded skill prompt and restores the previous model", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoDir = await makeTempDir();
		const skillDir = join(repoDir, "skills", "ccc-sidebar");
		await mkdir(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		await writeFile(skillPath, "---\nname: ccc-sidebar\n---\nUse direct `--description` command shape.\n", "utf8");
		const pi = new FakePi({ skillCommands: [skillCommand("ccc-sidebar", skillPath)] });
		const controller = createCccSidebarController(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoDir, model: PREVIOUS_MODEL, fastModel: FAST_MODEL });

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
		const ctx = new FakeCommandContext({ branchEntries: [branchContextOutputEntry("feature/latest")] });
		ctx.shouldConfirm = false;

		await pi.commands.get("ccc:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Cancelled; no cmux workspace was opened.");
	});

	test("ccc:workspace:open-branch does not infer from text-only branch context output", async () => {
		const pi = new FakePi();
		registerCccSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext({
			branchEntries: [
				{
					message: {
						customType: "branch-context-output",
						content: [
							"Created branch context and attached plan.",
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
		expect(ctx.notifications.at(-1)?.message).toContain("No latest [branch-context-output] branch found");
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
		expect(content).toContain(`Content-derived branch-context slug: ${PLAN_SLUG}`);
		expect(content).toContain(`Source branch: ${SOURCE_BRANCH}`);
		expect(content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(content).toContain("slot checkout");
		expect(content).toContain("cmux new-workspace");
		expect(content).toContain(`--description 'dispatch-plan from ${SOURCE_BRANCH}'`);
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
				step("brmem", ["check", PLAN_KEY, "--namespace", "branch-context", "--branch", PLAN_SLUG, "--format", "json"], { code: 1 }),
				gitCurrentBranchStep(),
				step("gt", ["info", SOURCE_BRANCH, "--no-interactive"], {}),
				step("git", ["branch", PLAN_SLUG, "HEAD"], {}),
				step("gt", ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("brmem", ["put", PLAN_KEY, "--namespace", "branch-context", "--branch", PLAN_SLUG, "--file", realPlanFile, "--format", "json"], {
					stdout: brmemPutJson(repoRoot, realPlanFile),
				}),
				step("slot", ["checkout", PLAN_SLUG, "--format", "json", "--no-clipboard"], { stdout: slotCheckoutJson(PLAN_SLUG) }),
				step("cmux", [
					"new-workspace",
					"--name",
					PLAN_SLUG,
					"--description",
					`dispatch-plan from ${SOURCE_BRANCH}`,
					"--cwd",
					WORKTREE,
					"--command",
					`pi --provider anthropic --model claude-sonnet-4-5 --thinking medium ${formatImplBranchContextCommand(PLAN_KEY)}`,
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
		const outsidePlanFile = join(outsideDir, SAVED_PLAN_FILENAME);
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

	test("ccc:workspace:dispatch-prompt stores payload in Branch Memory and opens cmux without sidebar summary", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const launchCommand = `payload="$(brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH})" && exec pi --provider anthropic --model claude-sonnet-4-5 --thinking medium "$payload"`;
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step("pi", buildGptNanoTextArgs(buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" })), { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("brmem", ["check", DISPATCH_PROMPT_KEY, "--namespace", DISPATCH_PROMPT_NAMESPACE, "--branch", BRANCH, "--format", "json"], { code: 1 }),
				step("brmem", ["put", DISPATCH_PROMPT_KEY, "--namespace", DISPATCH_PROMPT_NAMESPACE, "--branch", BRANCH, "--file", stagedPromptFile, "--format", "json"], {
					stdout: dispatchPromptPutJson(stagedPromptFile),
				}),
				step("slot", ["checkout", BRANCH, "--format", "json", "--no-clipboard"], { stdout: slotCheckoutJson(BRANCH) }),
				step("cmux", [
					"new-workspace",
					"--name",
					BRANCH,
					"--description",
					`dispatch-prompt from ${SOURCE_BRANCH}`,
					"--cwd",
					WORKTREE,
					"--command",
					launchCommand,
				], {}),
			],
		});
		registerCccSlotDispatchPromptCommand(pi, { stagingDir, now: () => 123, shouldCleanupStagingFile: false });
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("ccc:workspace:dispatch-prompt")?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		const promptText = await readFile(stagedPromptFile, "utf8");
		expect(promptText).toContain("Implement the cmux dispatch flow");
		expect(promptText).toContain("!asdl-dev submit");
		expect(notificationMessages(ctx).some((message) => message.includes(`Opened cmux workspace: ${BRANCH}`))).toBe(true);
		expect(notificationMessages(ctx).join("\n")).toContain(`${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY}`);
		expect(launchCommand).not.toContain("@");
		expect(launchCommand).toContain(`brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH}`);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("ccc:workspace:dispatch-prompt refuses to overwrite an existing Branch Memory payload", async () => {
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step("pi", buildGptNanoTextArgs(buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" })), { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("brmem", ["check", DISPATCH_PROMPT_KEY, "--namespace", DISPATCH_PROMPT_NAMESPACE, "--branch", BRANCH, "--format", "json"], { code: 0 }),
			],
		});
		registerCccSlotDispatchPromptCommand(pi);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("ccc:workspace:dispatch-prompt")?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("Refusing to overwrite; no cmux workspace was opened.");
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});

	test("ccc:workspace:dispatch-prompt does not open cmux when Branch Memory storage fails", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step("pi", buildGptNanoTextArgs(buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" })), { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("brmem", ["check", DISPATCH_PROMPT_KEY, "--namespace", DISPATCH_PROMPT_NAMESPACE, "--branch", BRANCH, "--format", "json"], { code: 1 }),
				step("brmem", ["put", DISPATCH_PROMPT_KEY, "--namespace", DISPATCH_PROMPT_NAMESPACE, "--branch", BRANCH, "--file", stagedPromptFile, "--format", "json"], {
					code: 2,
					stderr: "cannot write entry\n",
				}),
			],
		});
		registerCccSlotDispatchPromptCommand(pi, { stagingDir, now: () => 123 });
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("ccc:workspace:dispatch-prompt")?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("failed to store dispatch prompt payload in Branch Memory");
		expect(notificationMessages(ctx).join("\n")).toContain("No cmux workspace was opened.");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});
});
