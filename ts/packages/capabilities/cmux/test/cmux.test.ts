import { afterEach, describe, expect, test, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	buildPlanContentSlugPrompt,
	createBranchContextContext,
} from "@nseng-ai/branch-context/api";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";

// Intentional golden literal: pins the agent-facing implementation command name
// independently of formatImplBranchContextCommand in @nseng-ai/branch-context/pi.
function expectedImplBranchContextCommand(key: string): string {
	return `/ns:branch-context:impl-attached-plan ${key}`;
}
import type { StdinCapableCommandExecApi } from "@nseng-ai/foundation/command";
import { withTempRepoSkill } from "@nseng-ai/foundation/test-kit";
import { CMUX_COMMAND_NAMES, type CccSlotDispatchPlanOptions } from "@nseng-ai/cmux/api";
import registerCccExtension, {
	createCccSidebarControllerWithPiWiring,
	registerCccSidebarCommands,
	registerCccSlotDispatchFromTrunkCommand,
	registerCccSlotDispatchPlanCommand,
	registerCccSlotDispatchPromptCommand,
	registerCccSlotOpenBranchCommand,
	registerCccSurfaceDispatchPlanCommand,
} from "@nseng-ai/cmux/pi";
import type { GraphiteMetadataDbAccess } from "@nseng-ai/capability-kit/graphite/metadata";
import { buildRawTextModelArgs } from "@nseng-ai/capability-kit/model-slug";
import { buildSlugPrompt } from "../src/core/branch-slug.ts";
import { buildLaunchPrompt } from "../src/core/dispatch-prompt.ts";
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
	brmemCheckJson,
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
	step,
	writeCmuxPlanStoreFile,
} from "./ccc-test-harness.ts";

const SAVED_PLAN_FILENAME_SLUG = "saved-plan-local-locator";
const SAVED_PLAN_FILE_NAME = `${SAVED_PLAN_FILENAME_SLUG}.md`;
const PLAN_CONTENT = "# Plan\n";
const DISPATCH_PROMPT_NAMESPACE = "cmux-dispatch";

function graphiteMetadataDbAccessWithTrunk(trunkBranch: string): GraphiteMetadataDbAccess {
	return {
		exists: () => true,
		queryJson: (_dbPath, query) => {
			if (query.startsWith("PRAGMA")) {
				return {
					ok: true,
					value: [
						{ name: "branch_name" },
						{ name: "parent_branch_name" },
						{ name: "children" },
						{ name: "validation_result" },
					],
				};
			}
			return {
				ok: true,
				value: [
					{
						branch_name: trunkBranch,
						parent_branch_name: null,
						children: "[]",
						validation_result: "TRUNK",
					},
				],
			};
		},
	};
}

const testSlotClient = {
	async checkoutCurrent() {
		return {
			ok: false as const,
			failure: {
				errorType: "unexpected-current-checkout",
				message: "Unexpected current ns slot checkout in cmux command test.",
			},
		};
	},
	async checkoutBranch(options: { branchName: string }) {
		return {
			ok: true as const,
			target: {
				slotName: "slot-01",
				branchName: options.branchName,
				worktreePath: "/slot/worktree",
				isAlreadyAssigned: false,
				hasCreatedBranch: false,
				currentWorktreeNote: null,
			},
		};
	},
};

const failingTestSlotClient = {
	async checkoutCurrent() {
		return {
			ok: false as const,
			failure: { errorType: "slot-unavailable", message: "slot unavailable" },
		};
	},
	async checkoutBranch() {
		return {
			ok: false as const,
			failure: { errorType: "slot-unavailable", message: "slot unavailable" },
		};
	},
};

function branchContextTestOptions(planStoreRoot: string): CccSlotDispatchPlanOptions {
	return {
		planStoreRoot,
		slotClient: testSlotClient,
		createBranchContextContext(pi, cwd) {
			const stdinCapablePi: StdinCapableCommandExecApi = {
				supportsStdin: true,
				exec: (command, args, options) => pi.exec(command, args, options),
			};
			return {
				...createBranchContextContext(stdinCapablePi, { cwd }),
				brmem: new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
			};
		},
	};
}

const DISPATCH_PROMPT_KEY = "prompt.md";
const TRUNK_BRANCH = "master";

function dispatchPromptPutJson(sourceFile: string): string {
	return JSON.stringify({
		exitCode: 0,
		data: {
			namespace: DISPATCH_PROMPT_NAMESPACE,
			key: DISPATCH_PROMPT_KEY,
			branch: BRANCH,
			refName: `refs/brmem/ns/${DISPATCH_PROMPT_NAMESPACE}/${BRANCH}:${DISPATCH_PROMPT_KEY}`,
			commit: START_POINT,
			sourceFile: sourceFile,
		},
	});
}

afterEach(resetCmuxTestEnvironment);

describe("CCC cmux command suite", () => {
	test("registers the project CCC command suite", () => {
		const pi = new FakePi();

		registerCccExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual(CMUX_COMMAND_NAMES);
	});

	test("dispatch launch prompt keeps the user prompt at the bottom", () => {
		const prompt = [
			"Address this review feedback.",
			"",
			"Totals:",
			"- Unresolved review threads included: 11",
		].join("\n");

		const launchPrompt = buildLaunchPrompt(prompt, "Created from trunk.");

		expect(launchPrompt).toContain("## Completion instructions\n");
		expect(launchPrompt).toContain("## Dispatch context\nCreated from trunk.\n");
		expect(launchPrompt.endsWith(prompt)).toBe(true);
		expect(launchPrompt.indexOf("## Completion instructions")).toBeLessThan(
			launchPrompt.indexOf(prompt),
		);
	});

	test("ns:cmux:sidebar:session-summary queues session-aware skill prompt and restores the previous model", async () => {
		vi.stubEnv("CMUX_WORKSPACE_ID", "workspace:caller");
		await withTempRepoSkill(
			{
				skillName: "ns-cmux-sidebar",
				markdown: "---\nname: ns-cmux-sidebar\n---\nUse direct `--description` command shape.\n",
			},
			async ({ repoDir, skillPath }) => {
				const pi = new FakePi({ skillCommands: [skillCommand("ns-cmux-sidebar", skillPath)] });
				const controller = createCccSidebarControllerWithPiWiring(pi);
				registerCccSidebarCommands(pi, controller);
				const ctx = new FakeCommandContext({
					cwd: repoDir,
					model: PREVIOUS_MODEL,
					fastModel: FAST_MODEL,
				});

				await pi.commands.get("ns:cmux:sidebar:session-summary")?.handler("", ctx);

				expect(ctx.waitCount).toBe(1);
				expect(pi.sentUserMessages).toHaveLength(1);
				expect(pi.sentUserMessages[0]).toContain('<skill name="ns-cmux-sidebar"');
				expect(pi.sentUserMessages[0]).toContain(
					"Requested command: ns:cmux:sidebar:session-summary.",
				);
				expect(pi.sentUserMessages[0]).toContain("current task, progress, and likely next action");
				expect(pi.sentUserMessages[0]).toContain("The title must be exactly summary:<slug>");
				expect(pi.sentUserMessages[0]).not.toContain(
					"The Goal line should describe the PR outcome",
				);
				expect(notificationMessages(ctx)).toContain("Invoking cmux session sidebar summary.");
				expect(pi.setModels).toEqual([FAST_MODEL]);
				expect(pi.thinkingLevels).toEqual(["minimal"]);
				expect(ctx.statuses).toEqual([
					{ key: "pi:ns-cmux-sidebar", value: "preparing cmux sidebar…" },
					{ key: "pi:ns-cmux-sidebar", value: undefined },
				]);

				await pi.emitAgentEnd(ctx);

				expect(pi.setModels).toEqual([FAST_MODEL, PREVIOUS_MODEL]);
				expect(pi.thinkingLevels).toEqual(["minimal", "medium"]);
			},
		);
	});

	test("sidebar fallback uses one-line Goal description and missing workspace skips send", async () => {
		vi.stubEnv("CMUX_WORKSPACE_ID", "workspace:caller");
		const pi = new FakePi();
		const controller = createCccSidebarControllerWithPiWiring(pi);
		registerCccSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("ns:cmux:sidebar:session-summary")?.handler("", ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("--title 'summary:<slug>'");
		expect(pi.sentUserMessages[0]).toContain("--description 'Goal: ...'");
		expect(pi.sentUserMessages[0]).not.toContain("State: ...");
		expect(pi.sentUserMessages[0]).not.toContain("--goal");
		expect(pi.sentUserMessages[0]).not.toContain("--status");

		vi.stubEnv("CMUX_WORKSPACE_ID", undefined);
		vi.stubEnv("CMUX_TAB_ID", undefined);
		const noWorkspace = new FakeCommandContext();
		await pi.commands.get("ns:cmux:sidebar:session-summary")?.handler("", noWorkspace);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(noWorkspace.notifications.at(-1)?.message).toBe(
			"Not running inside a cmux caller workspace.",
		);
	});

	test("ns:cmux:sidebar:branch-state-summary queues branch-parent state prompt", async () => {
		vi.stubEnv("CMUX_WORKSPACE_ID", "workspace:caller");
		await withTempRepoSkill(
			{
				skillName: "ns-cmux-sidebar",
				markdown: "---\nname: ns-cmux-sidebar\n---\nUse direct `--description` command shape.\n",
			},
			async ({ repoDir, skillPath }) => {
				const pi = new FakePi({ skillCommands: [skillCommand("ns-cmux-sidebar", skillPath)] });
				const controller = createCccSidebarControllerWithPiWiring(pi);
				registerCccSidebarCommands(pi, controller);
				const ctx = new FakeCommandContext({
					cwd: repoDir,
					model: PREVIOUS_MODEL,
					fastModel: FAST_MODEL,
				});

				await pi.commands.get("ns:cmux:sidebar:branch-state-summary")?.handler("", ctx);

				expect(ctx.waitCount).toBe(1);
				expect(pi.sentUserMessages).toHaveLength(1);
				expect(pi.sentUserMessages[0]).toContain('<skill name="ns-cmux-sidebar"');
				expect(pi.sentUserMessages[0]).toContain(
					"Requested command: ns:cmux:sidebar:branch-state-summary.",
				);
				expect(pi.sentUserMessages[0]).toContain(
					"current Git branch's implementation state relative to its parent branch",
				);
				expect(pi.sentUserMessages[0]).toContain("gt parent --no-interactive");
				expect(pi.sentUserMessages[0]).toContain("The title must be exactly state:<slug>");
				expect(pi.sentUserMessages[0]).toContain(
					"The State line should describe what the branch currently changes",
				);
				expect(notificationMessages(ctx)).toContain("Invoking cmux branch-state sidebar summary.");
				expect(pi.setModels).toEqual([FAST_MODEL]);
				expect(pi.thinkingLevels).toEqual(["minimal"]);
				expect(ctx.statuses).toEqual([
					{ key: "pi:ns-cmux-sidebar", value: "preparing cmux branch-state sidebar…" },
					{ key: "pi:ns-cmux-sidebar", value: undefined },
				]);

				await pi.emitAgentEnd(ctx);

				expect(pi.setModels).toEqual([FAST_MODEL, PREVIOUS_MODEL]);
				expect(pi.thinkingLevels).toEqual(["minimal", "medium"]);
			},
		);
	});

	test("ns:cmux:workspace:open-branch opens explicit branch without queuing sidebar summary", async () => {
		const pi = new FakePi({
			script: [
				step("git", ["remote", "get-url", "origin"], { stdout: "git@github.com:owner/repo.git\n" }),
				step(
					"cmux",
					["new-workspace", "--name", BRANCH, "--description", `repo/${BRANCH}`, "--cwd", WORKTREE],
					{},
				),
			],
		});
		registerCccSlotOpenBranchCommand(pi, { slotClient: testSlotClient });
		const ctx = new FakeCommandContext();

		await pi.commands.get("ns:cmux:workspace:open-branch")?.handler(BRANCH, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Opened cmux workspace for branch: ${BRANCH}`);
	});

	test("ns:cmux:workspace:open-branch cancels inferred branch without opening workspace", async () => {
		const pi = new FakePi();
		registerCccSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext({
			branchEntries: [branchContextOutputEntry("feature/latest")],
		});
		ctx.shouldConfirm = false;

		await pi.commands.get("ns:cmux:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Cancelled; no cmux workspace was opened.");
	});

	test("ns:cmux:workspace:open-branch does not infer from text-only branch context output", async () => {
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

		await pi.commands.get("ns:cmux:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain(
			"No latest [branch-context-output] branch found",
		);
	});

	test("ns:cmux:workspace:dispatch-plan dry-run emits preview without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, {
			fileName: SAVED_PLAN_FILE_NAME,
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), {
					stdout: `${PLAN_SLUG}\n`,
				}),
				headStep(),
			],
		});
		registerCccSlotDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })],
		});

		await pi.commands.get("ns:cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.details).toMatchObject({
			status: "dry-run",
			targetBranch: PLAN_SLUG,
			key: PLAN_KEY,
		});
		const content = String(pi.sentMessages[0]?.content);
		expect(content).toContain(
			"Dry run: no branch was created, no plan was attached, and no cmux workspace was opened.",
		);
		expect(content).toContain(`Path: ${planFile}`);
		expect(content).toContain(`Saved-plan filename slug: ${SAVED_PLAN_FILENAME_SLUG}`);
		expect(content).toContain(`Content-derived branch-context slug: ${PLAN_SLUG}`);
		expect(content).toContain(`Source branch: ${SOURCE_BRANCH}`);
		expect(content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(content).toContain("ns slot checkout");
		expect(content).toContain("cmux new-workspace");
		expect(content).toContain(`--description 'dispatch-plan from ${SOURCE_BRANCH}'`);
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
	});

	test("ns:cmux:workspace:dispatch-plan full success opens cmux without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, {
			fileName: SAVED_PLAN_FILE_NAME,
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), {
					stdout: `${PLAN_SLUG}\n`,
				}),
				step("git", ["check-ref-format", "--branch", PLAN_SLUG], {}),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				gitRootStep(repoRoot),
				headStep(),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				gitCurrentBranchStep(),
				step("gt", ["info", SOURCE_BRANCH, "--no-interactive"], {}),
				step("git", ["branch", PLAN_SLUG, "HEAD"], {}),
				step("gt", ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"cmux",
					[
						"new-workspace",
						"--name",
						PLAN_SLUG,
						"--description",
						`dispatch-plan from ${SOURCE_BRANCH}`,
						"--cwd",
						WORKTREE,
						"--command",
						`pi --provider anthropic --model claude-sonnet-4-5 --thinking medium '${expectedImplBranchContextCommand(PLAN_KEY)}'`,
					],
					{},
				),
			],
		});
		registerCccSlotDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			model: PREVIOUS_MODEL,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })],
		});

		await pi.commands.get("ns:cmux:workspace:dispatch-plan")?.handler("", ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "success" });
		expect(
			notificationMessages(ctx).some((message) =>
				message.includes("Dispatched plan in cmux workspace."),
			),
		).toBe(true);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("ns:cmux:surface:dispatch-plan dry-run previews a new surface launch", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, {
			fileName: SAVED_PLAN_FILE_NAME,
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), {
					stdout: `${PLAN_SLUG}\n`,
				}),
				headStep(),
			],
		});
		registerCccSurfaceDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })],
		});

		await pi.commands.get("ns:cmux:surface:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(pi.sentMessages).toHaveLength(1);
		const content = String(pi.sentMessages[0]?.content);
		expect(content).toContain(
			"Dry run: no branch was created, no plan was attached, and no cmux surface was opened.",
		);
		expect(content).toContain("ns slot checkout");
		expect(content).toContain("cmux new-surface");
		expect(content).toContain("--focus false");
		expect(content).toContain("cmux rename-tab");
		expect(content).toContain("cmux send -- 'cd");
		expect(content).toContain("<slot-worktree-path>");
		expect(content).toContain("&& pi --thinking medium");
		expect(content).not.toContain("cmux new-workspace");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
	});

	test("ns:cmux:surface:dispatch-plan full success opens a background cmux surface", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, {
			fileName: SAVED_PLAN_FILE_NAME,
			content: PLAN_CONTENT,
		});
		const launchCommand = `pi --provider anthropic --model claude-sonnet-4-5 --thinking medium '${expectedImplBranchContextCommand(PLAN_KEY)}'`;
		const surfaceLaunchCommand = `cd ${WORKTREE} && ${launchCommand}`;
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), {
					stdout: `${PLAN_SLUG}\n`,
				}),
				step("git", ["check-ref-format", "--branch", PLAN_SLUG], {}),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				gitRootStep(repoRoot),
				headStep(),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				gitCurrentBranchStep(),
				step("gt", ["info", SOURCE_BRANCH, "--no-interactive"], {}),
				step("git", ["branch", PLAN_SLUG, "HEAD"], {}),
				step("gt", ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step("cmux", ["identify", "--json", "--id-format", "both"], {
					stdout: JSON.stringify({
						caller: { workspace_id: "workspace-1", pane_id: "pane-1", window_id: "window-1" },
					}),
				}),
				step(
					"cmux",
					[
						"--json",
						"new-surface",
						"--type",
						"terminal",
						"--workspace",
						"workspace-1",
						"--pane",
						"pane-1",
						"--focus",
						"false",
						"--window",
						"window-1",
					],
					{
						stdout: JSON.stringify({ surface_id: "surface-1", workspace_id: "workspace-1" }),
					},
				),
				step(
					"cmux",
					[
						"rename-tab",
						"--workspace",
						"workspace-1",
						"--surface",
						"surface-1",
						"--title",
						PLAN_SLUG,
						"--window",
						"window-1",
					],
					{},
				),
				step(
					"cmux",
					[
						"send",
						"--workspace",
						"workspace-1",
						"--surface",
						"surface-1",
						"--window",
						"window-1",
						"--",
						`${surfaceLaunchCommand}\n`,
					],
					{},
				),
			],
		});
		registerCccSurfaceDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			model: PREVIOUS_MODEL,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })],
		});

		await pi.commands.get("ns:cmux:surface:dispatch-plan")?.handler("", ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "success" });
		expect(
			notificationMessages(ctx).some((message) =>
				message.includes("Dispatched plan in cmux surface."),
			),
		).toBe(true);
		expect(notificationMessages(ctx).join("\n")).toContain("Surface: surface-1");
		expect(notificationMessages(ctx).join("\n")).toContain(`Command: ${surfaceLaunchCommand}`);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("ns:cmux:surface:dispatch-plan stops before cmux surface launch when ns slot checkout fails", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot, {
			fileName: SAVED_PLAN_FILE_NAME,
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				step("pi", buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT)), {
					stdout: `${PLAN_SLUG}\n`,
				}),
				step("git", ["check-ref-format", "--branch", PLAN_SLUG], {}),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				gitRootStep(repoRoot),
				headStep(),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				gitCurrentBranchStep(),
				step("gt", ["info", SOURCE_BRANCH, "--no-interactive"], {}),
				step("git", ["branch", PLAN_SLUG, "HEAD"], {}),
				step("gt", ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
			],
		});
		registerCccSurfaceDispatchPlanCommand(pi, {
			...branchContextTestOptions(planStoreRoot),
			slotClient: failingTestSlotClient,
		});
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			model: PREVIOUS_MODEL,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { slug: SAVED_PLAN_FILENAME_SLUG })],
		});

		await pi.commands.get("ns:cmux:surface:dispatch-plan")?.handler("", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("Failed to check out branch slot.");
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});

	test("ns:cmux:workspace:dispatch-plan rejects session plan outside local plan store", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const outsidePlanFile = join(outsideDir, SAVED_PLAN_FILENAME);
		await writeFile(outsidePlanFile, "# Outside Plan\n", "utf8");
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCccSlotDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, outsidePlanFile)],
		});

		await pi.commands.get("ns:cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain(
			"outside the current local plan store directory",
		);
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("ns:cmux:workspace:dispatch-plan rejects wrong repo metadata", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCccSlotDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { repoKey: "gh--other--repo" })],
		});

		await pi.commands.get("ns:cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("repoKey");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("ns:cmux:workspace:dispatch-plan rejects wrong source branch or branch key", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCccSlotDispatchPlanCommand(pi, branchContextTestOptions(planStoreRoot));
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [
				savedPlanEntry(repoRoot, planFile, {
					sourceBranch: "other-branch",
					branchKey: "other-branch",
				}),
			],
		});

		await pi.commands.get("ns:cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("sourceBranch");
		expect(notificationMessages(ctx).join("\n")).toContain("branchKey");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("ns:cmux:workspace:dispatch-prompt stores payload in Branch Memory and opens cmux without sidebar summary", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const launchCommand = `payload="$(brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH})" && exec pi --provider anthropic --model claude-sonnet-4-5 --thinking medium "$payload"`;
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step(
					"pi",
					buildRawTextModelArgs(
						buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" }),
					),
					{ stdout: `${BRANCH}\n` },
				),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--format",
						"json",
					],
					{ stdout: brmemCheckJson(false) },
				),
				step(
					"brmem",
					[
						"put",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{
						stdout: dispatchPromptPutJson(stagedPromptFile),
					},
				),
				step(
					"cmux",
					[
						"new-workspace",
						"--name",
						BRANCH,
						"--description",
						`dispatch-prompt from ${SOURCE_BRANCH}`,
						"--cwd",
						WORKTREE,
						"--command",
						launchCommand,
					],
					{},
				),
			],
		});
		registerCccSlotDispatchPromptCommand(pi, {
			stagingDir,
			now: () => 123,
			shouldCleanupStagingFile: false,
			slotClient: testSlotClient,
		});
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-prompt")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		const promptText = await readFile(stagedPromptFile, "utf8");
		expect(promptText).toContain("Implement the cmux dispatch flow");
		expect(promptText).toContain("!ns flow submit");
		expect(
			notificationMessages(ctx).some((message) =>
				message.includes(`Opened cmux workspace: ${BRANCH}`),
			),
		).toBe(true);
		expect(notificationMessages(ctx).join("\n")).toContain(
			`${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY}`,
		);
		expect(launchCommand).not.toContain("@");
		expect(launchCommand).toContain(
			`brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH}`,
		);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("ns:cmux:workspace:dispatch-from-trunk stores payload from refreshed Graphite trunk and opens cmux", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const launchCommand = `payload="$(brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH})" && exec pi --provider anthropic --model claude-sonnet-4-5 --thinking medium "$payload"`;
		const pi = new FakePi({
			script: [
				step("gt", ["trunk", "--no-interactive"], { stdout: `${TRUNK_BRANCH}\n` }),
				step("git", ["worktree", "list", "--porcelain"], {
					stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
				}),
				step(
					"git",
					["fetch", "origin", `refs/heads/${TRUNK_BRANCH}:refs/heads/${TRUNK_BRANCH}`],
					{},
				),
				step("git", ["rev-parse", TRUNK_BRANCH], { stdout: `${START_POINT}\n` }),
				step(
					"pi",
					buildRawTextModelArgs(
						buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" }),
					),
					{ stdout: `${BRANCH}\n` },
				),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, TRUNK_BRANCH], {}),
				step("gt", ["track", BRANCH, "--parent", TRUNK_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--format",
						"json",
					],
					{ stdout: brmemCheckJson(false) },
				),
				step(
					"brmem",
					[
						"put",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{
						stdout: dispatchPromptPutJson(stagedPromptFile),
					},
				),
				step(
					"cmux",
					[
						"new-workspace",
						"--name",
						BRANCH,
						"--description",
						`dispatch-from-trunk from ${TRUNK_BRANCH}`,
						"--cwd",
						WORKTREE,
						"--command",
						launchCommand,
					],
					{},
				),
			],
		});
		registerCccSlotDispatchFromTrunkCommand(pi, {
			stagingDir,
			now: () => 123,
			shouldCleanupStagingFile: false,
			slotClient: testSlotClient,
		});
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-from-trunk")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		const promptText = await readFile(stagedPromptFile, "utf8");
		expect(promptText).toContain("Implement the cmux dispatch flow");
		expect(promptText).toContain("created from refreshed Graphite trunk");
		expect(promptText).toContain("!ns flow submit");
		expect(
			notificationMessages(ctx).some((message) =>
				message.includes(`Opened cmux workspace: ${BRANCH}`),
			),
		).toBe(true);
		expect(notificationMessages(ctx).join("\n")).toContain(`Parent: ${TRUNK_BRANCH}`);
		expect(notificationMessages(ctx).join("\n")).toContain(`Start point: ${START_POINT}`);
		expect(notificationMessages(ctx).join("\n")).toContain(
			`${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY}`,
		);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("ns:cmux:workspace:dispatch-from-trunk falls back to Graphite metadata when HEAD is detached", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const launchCommand = `payload="$(brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH})" && exec pi --provider anthropic --model claude-sonnet-4-5 --thinking medium "$payload"`;
		const pi = new FakePi({
			script: [
				step("gt", ["trunk", "--no-interactive"], {
					code: 1,
					stderr: "ERROR: No current branch\n",
				}),
				step("git", ["rev-parse", "--git-common-dir"], { stdout: "/repo/.git\n" }),
				step("git", ["worktree", "list", "--porcelain"], {
					stdout: "worktree /repo\nHEAD abc123\n",
				}),
				step(
					"git",
					["fetch", "origin", `refs/heads/${TRUNK_BRANCH}:refs/heads/${TRUNK_BRANCH}`],
					{},
				),
				step("git", ["rev-parse", TRUNK_BRANCH], { stdout: `${START_POINT}\n` }),
				step(
					"pi",
					buildRawTextModelArgs(
						buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" }),
					),
					{ stdout: `${BRANCH}\n` },
				),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, TRUNK_BRANCH], {}),
				step("gt", ["track", BRANCH, "--parent", TRUNK_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--format",
						"json",
					],
					{ stdout: brmemCheckJson(false) },
				),
				step(
					"brmem",
					[
						"put",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{ stdout: dispatchPromptPutJson(stagedPromptFile) },
				),
				step(
					"cmux",
					[
						"new-workspace",
						"--name",
						BRANCH,
						"--description",
						`dispatch-from-trunk from ${TRUNK_BRANCH}`,
						"--cwd",
						WORKTREE,
						"--command",
						launchCommand,
					],
					{},
				),
			],
		});
		registerCccSlotDispatchFromTrunkCommand(pi, {
			stagingDir,
			now: () => 123,
			shouldCleanupStagingFile: false,
			slotClient: testSlotClient,
			metadataDbAccess: graphiteMetadataDbAccessWithTrunk(TRUNK_BRANCH),
		});
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-from-trunk")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain(`Parent: ${TRUNK_BRANCH}`);
		expect(await readFile(stagedPromptFile, "utf8")).toContain(
			"created from refreshed Graphite trunk",
		);
	});

	test("ns:cmux:workspace:dispatch-from-trunk requires inline prompt args", async () => {
		const pi = new FakePi();
		registerCccSlotDispatchFromTrunkCommand(pi);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("ns:cmux:workspace:dispatch-from-trunk")?.handler("", ctx);

		expect(ctx.waitCount).toBe(0);
		expect(notificationMessages(ctx)).toContain(
			"Usage: /ns:cmux:workspace:dispatch-from-trunk <prompt>",
		);
		expect(pi.execCalls).toEqual([]);
	});

	test("ns:cmux:workspace:dispatch-from-trunk stops when Graphite trunk cannot be resolved", async () => {
		const pi = new FakePi({
			script: [step("gt", ["trunk", "--no-interactive"], { code: 1, stderr: "no trunk\n" })],
		});
		registerCccSlotDispatchFromTrunkCommand(pi);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-from-trunk")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("Could not resolve Graphite trunk");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});

	test("ns:cmux:workspace:dispatch-from-trunk stops when Graphite trunk output is empty", async () => {
		const pi = new FakePi({
			script: [step("gt", ["trunk", "--no-interactive"], { stdout: "\n" })],
		});
		registerCccSlotDispatchFromTrunkCommand(pi);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-from-trunk")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain(
			"gt trunk --no-interactive returned no branch",
		);
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});

	test("ns:cmux:workspace:dispatch-from-trunk pulls trunk when it is checked out elsewhere", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const trunkWorktree = "/repo-trunk";
		const launchCommand = `payload="$(brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH})" && exec pi --provider anthropic --model claude-sonnet-4-5 --thinking medium "$payload"`;
		const pi = new FakePi({
			script: [
				step("gt", ["trunk", "--no-interactive"], { stdout: `${TRUNK_BRANCH}\n` }),
				step("git", ["worktree", "list", "--porcelain"], {
					stdout: [
						`worktree ${trunkWorktree}`,
						"HEAD abc123",
						`branch refs/heads/${TRUNK_BRANCH}`,
						"",
					].join("\n"),
				}),
				step("git", ["pull", "--ff-only", "origin", TRUNK_BRANCH], {}),
				step("git", ["rev-parse", TRUNK_BRANCH], { stdout: `${START_POINT}\n` }),
				step(
					"pi",
					buildRawTextModelArgs(
						buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" }),
					),
					{ stdout: `${BRANCH}\n` },
				),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, TRUNK_BRANCH], {}),
				step("gt", ["track", BRANCH, "--parent", TRUNK_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--format",
						"json",
					],
					{ stdout: brmemCheckJson(false) },
				),
				step(
					"brmem",
					[
						"put",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{
						stdout: dispatchPromptPutJson(stagedPromptFile),
					},
				),
				step(
					"cmux",
					[
						"new-workspace",
						"--name",
						BRANCH,
						"--description",
						`dispatch-from-trunk from ${TRUNK_BRANCH}`,
						"--cwd",
						WORKTREE,
						"--command",
						launchCommand,
					],
					{},
				),
			],
		});
		registerCccSlotDispatchFromTrunkCommand(pi, {
			stagingDir,
			now: () => 123,
			shouldCleanupStagingFile: false,
			slotClient: testSlotClient,
		});
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-from-trunk")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(
			pi.execCalls.find((call) => call.command === "git" && call.args[0] === "pull")?.options?.cwd,
		).toBe(trunkWorktree);
		expect(
			notificationMessages(ctx).some((message) =>
				message.includes(`Opened cmux workspace: ${BRANCH}`),
			),
		).toBe(true);
	});

	test("ns:cmux:workspace:dispatch-from-trunk stops when trunk refresh fails", async () => {
		const pi = new FakePi({
			script: [
				step("gt", ["trunk", "--no-interactive"], { stdout: `${TRUNK_BRANCH}\n` }),
				step("git", ["worktree", "list", "--porcelain"], {
					stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
				}),
				step("git", ["fetch", "origin", `refs/heads/${TRUNK_BRANCH}:refs/heads/${TRUNK_BRANCH}`], {
					code: 1,
					stderr: "fetch failed\n",
				}),
			],
		});
		registerCccSlotDispatchFromTrunkCommand(pi);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-from-trunk")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		const messages = notificationMessages(ctx).join("\n");
		expect(messages).toContain("Graphite trunk refresh failed");
		expect(messages).toContain("no branch was created");
		expect(messages).toContain("fetch failed");
		expect(messages).toContain("Cwd: /repo");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});

	test("ns:cmux:workspace:dispatch-prompt refuses to overwrite an existing Branch Memory payload", async () => {
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step(
					"pi",
					buildRawTextModelArgs(
						buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" }),
					),
					{ stdout: `${BRANCH}\n` },
				),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--format",
						"json",
					],
					{ stdout: brmemCheckJson(true) },
				),
			],
		});
		registerCccSlotDispatchPromptCommand(pi);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-prompt")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain(
			"Refusing to overwrite; no cmux workspace was opened.",
		);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(
			false,
		);
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});

	test("ns:cmux:workspace:dispatch-prompt does not open cmux when Branch Memory storage fails", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step(
					"pi",
					buildRawTextModelArgs(
						buildSlugPrompt({ kind: "task", content: "Implement the cmux dispatch flow" }),
					),
					{ stdout: `${BRANCH}\n` },
				),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("git", ["branch", BRANCH, "HEAD"], {}),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--format",
						"json",
					],
					{ stdout: brmemCheckJson(false) },
				),
				step(
					"brmem",
					[
						"put",
						DISPATCH_PROMPT_KEY,
						"--namespace",
						DISPATCH_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{
						code: 2,
						stderr: "cannot write entry\n",
					},
				),
			],
		});
		registerCccSlotDispatchPromptCommand(pi, { stagingDir, now: () => 123 });
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands
			.get("ns:cmux:workspace:dispatch-prompt")
			?.handler("Implement the cmux dispatch flow", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain(
			"failed to store dispatch prompt payload in Branch Memory",
		);
		expect(notificationMessages(ctx).join("\n")).toContain("No cmux workspace was opened.");
		expect(pi.execCalls.some((call) => call.command === "slot")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "cmux")).toBe(false);
	});
});
