/**
 * Scenario tests for the Herdr dispatch commands:
 *  - ns:herdr:handoff:prompt
 *  - ns:herdr:handoff:trunk-prompt
 *  - ns:herdr:handoff:plan
 *  - ns:herdr:tab:plan-dispatch
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};

import { HERDR_BASE_COMMAND_NAMES } from "../src/core/command-surfaces.ts";
import registerHerdrPiExtension from "../src/pi/extension.ts";
import {
	registerHerdrSlotDispatchPlanCommand,
	registerHerdrSurfaceDispatchPlanCommand,
} from "../src/pi/dispatch-plan.ts";
import { handleHerdrSlotDispatchPlan } from "../src/core/dispatch-plan.ts";
import { openBranchInHerdrWorkspace, openBranchInHerdrCallerTab } from "../src/core/slot.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { createCliHerdrGateway } from "../src/core/cli-gateway.ts";
import {
	handleHerdrSlotDispatchPrompt,
	resolveDispatchPromptPayloadOptions,
} from "../src/core/dispatch-prompt.ts";
import { handleHerdrSlotDispatchFromTrunk } from "../src/core/dispatch-from-trunk.ts";
import { buildWorkspaceGoalSlugPrompt } from "../src/core/space-goal.ts";
import { buildPlanContentSlugPrompt } from "@nseng-ai/branch-context/api";
import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import { createBranchContextContext } from "@nseng-ai/branch-context/api";
import { buildRawTextModelArgs } from "@nseng-ai/capability-kit/model-slug";
import { buildTrackedBranchSlugPrompt } from "@nseng-ai/capability-kit/tracked-branch-payload";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { StdinCapableCommandExecApi } from "@nseng-ai/foundation/command";

import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	makeTempDir,
	notificationMessages,
	resetHerdrTestEnvironment,
	ROOT,
	step,
	WORKTREE,
	BRANCH,
	PLAN_CONTENT,
	PLAN_SLUG,
	PLAN_KEY,
	SOURCE_BRANCH,
	START_POINT,
	dispatchValidationScript,
	gitRootStep,
	headStep,
	writePlanStoreFile,
	savedPlanEntry,
} from "./herdr-test-harness.ts";

afterEach(resetHerdrTestEnvironment);

const DISPATCH_PROMPT_NAMESPACE = "ns-dispatch";
const DISPATCH_PROMPT_KEY = "prompt.md";
const TRUNK_BRANCH = "master";

function brmemCheckJson(isPresent: boolean): string {
	return JSON.stringify({ exitCode: 0, data: { present: isPresent } });
}

function dispatchPromptPutJson(sourceFile: string): string {
	return JSON.stringify({
		exitCode: 0,
		data: {
			namespace: DISPATCH_PROMPT_NAMESPACE,
			key: DISPATCH_PROMPT_KEY,
			branch: BRANCH,
			refName: `refs/brmem/ns/${DISPATCH_PROMPT_NAMESPACE}/${BRANCH}:${DISPATCH_PROMPT_KEY}`,
			commit: START_POINT,
			sourceFile,
		},
	});
}

// ---------------------------------------------------------------------------
// A minimal test slot client that simulates a successful checkout.
// ---------------------------------------------------------------------------
const testSlotClient = {
	async checkoutCurrent() {
		return {
			ok: false as const,
			failure: {
				errorType: "unexpected-current-checkout",
				message: "Unexpected current ns slot checkout in herdr command test.",
			},
		};
	},
	async checkoutBranch(options: { branchName: string }) {
		return {
			ok: true as const,
			target: {
				slotName: "slot-01",
				branchName: options.branchName,
				worktreePath: WORKTREE,
				isAlreadyAssigned: false,
				hasCreatedBranch: false,
				currentWorktreeNote: null,
			},
		};
	},
};

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

describe("herdr Pi extension — full suite", () => {
	test("registers all herdr command surfaces", () => {
		const pi = new FakePi();
		registerHerdrPiExtension(pi);
		expect([...pi.commands.keys()].sort()).toEqual([...HERDR_BASE_COMMAND_NAMES].sort());
	});
});

// ---------------------------------------------------------------------------
// handoff:prompt and handoff:trunk-prompt
// ---------------------------------------------------------------------------

describe("Herdr prompt dispatch", () => {
	test("stores a neutral payload and launches it in the created workspace", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr dispatch flow";
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				gitRootStep(ROOT),
				step(
					"pi",
					buildRawTextModelArgs(
						buildTrackedBranchSlugPrompt({ kind: "task", content: prompt }),
						TEST_MODEL_SELECTION,
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
					{ stdout: dispatchPromptPutJson(stagedPromptFile) },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPrompt({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			payloadOptions: resolveDispatchPromptPayloadOptions({
				stagingDir,
				now: () => 123,
				shouldCleanupStagingFile: false,
			}),
			slotClient: testSlotClient,
			args: prompt,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(await readFile(stagedPromptFile, "utf8")).toContain(prompt);
		expect(herdr.createWorkspaceCalls).toHaveLength(1);
		expect(herdr.paneRunCalls).toHaveLength(1);
		expect(herdr.paneRunCalls[0]?.command).toContain(
			`brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH}`,
		);
		expect(notificationMessages(ctx).join("\n")).toContain(
			`${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY}`,
		);
	});

	test("dispatches from refreshed trunk through the neutral payload", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr trunk flow";
		const pi = new FakePi({
			script: [
				gitRootStep(ROOT),
				step(
					"pi",
					buildRawTextModelArgs(buildWorkspaceGoalSlugPrompt(prompt), TEST_MODEL_SELECTION),
					{
						stdout: "implement-herdr-trunk-flow\n",
					},
				),
				step("git", ["worktree", "list", "--porcelain"], {
					stdout: "worktree /repo\nHEAD abc123\nbranch refs/heads/feature\n",
				}),
				step(
					"git",
					["fetch", "origin", `refs/heads/${TRUNK_BRANCH}:refs/heads/${TRUNK_BRANCH}`],
					{},
				),
				step("git", ["rev-parse", TRUNK_BRANCH], { stdout: `${START_POINT}\n` }),
				gitRootStep(ROOT),
				step(
					"pi",
					buildRawTextModelArgs(
						buildTrackedBranchSlugPrompt({ kind: "task", content: prompt }),
						TEST_MODEL_SELECTION,
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
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchFromTrunk({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			payloadOptions: resolveDispatchPromptPayloadOptions({
				stagingDir,
				now: () => 123,
				shouldCleanupStagingFile: false,
			}),
			graphite: { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) },
			git: {
				branchUpstream: async () => ({
					type: "found",
					value: { remoteName: "origin", remoteRef: `refs/heads/${TRUNK_BRANCH}` },
				}),
			},
			slotClient: testSlotClient,
			args: prompt,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(await readFile(stagedPromptFile, "utf8")).toContain(
			"created from refreshed Graphite trunk",
		);
		expect(herdr.createWorkspaceCalls).toHaveLength(1);
		expect(herdr.createWorkspaceCalls[0]?.options.label).toBe("implement-herdr-trunk-flow");
		expect(pi.execCalls[1]?.options?.cwd).toBe(ROOT);
		expect(pi.execCalls[1]?.args.at(-1)).toContain("Generate a concise workspace name slug");
		expect(pi.execCalls[1]?.args.at(-1)).toContain(prompt);
		expect(herdr.paneRunCalls[0]?.command).toContain(`--namespace ${DISPATCH_PROMPT_NAMESPACE}`);
	});

	test("does not open a Herdr workspace when payload storage fails", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr dispatch flow";
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				gitRootStep(ROOT),
				step(
					"pi",
					buildRawTextModelArgs(
						buildTrackedBranchSlugPrompt({ kind: "task", content: prompt }),
						TEST_MODEL_SELECTION,
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
					{ code: 2, stderr: "cannot write entry\n" },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPrompt({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			payloadOptions: resolveDispatchPromptPayloadOptions({ stagingDir, now: () => 123 }),
			slotClient: testSlotClient,
			args: prompt,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"failed to store dispatch prompt payload in Branch Memory",
		);
		expect(notificationMessages(ctx).join("\n")).toContain("No Herdr workspace was opened.");
	});
});

// ---------------------------------------------------------------------------
// handoff:plan
// ---------------------------------------------------------------------------

describe("ns:herdr:handoff:plan", () => {
	test("shows help without side-effects on --help", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--help",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:handoff:plan",
				statusKey: "ns:herdr:handoff:plan",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toHaveLength(0);
		expect(pi.execCalls).toHaveLength(0);
		expect(notificationMessages(ctx).some((m) => m.includes("Usage:"))).toBe(true);
	});

	test("rejects unknown flags", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--unknown-flag",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:handoff:plan",
				statusKey: "ns:herdr:handoff:plan",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toHaveLength(0);
		const errors = ctx.notifications.filter((n) => n.level === "error");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]?.message).toContain("Unknown flag");
	});

	test("registers handoff:plan and tab:plan-dispatch via Pi adapter", () => {
		const pi = new FakePi();
		registerHerdrSlotDispatchPlanCommand(pi);
		registerHerdrSurfaceDispatchPlanCommand(pi);
		expect(pi.commands.has("ns:herdr:handoff:plan")).toBe(true);
		expect(pi.commands.has("ns:herdr:tab:plan-dispatch")).toBe(true);
	});

	test("tab:plan-dispatch requires HERDR_WORKSPACE_ID", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const repoRoot = await makeTempDir();
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
		expect(ctx.notifications).toContainEqual({
			message:
				"tab:plan-dispatch requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
			level: "error",
		});
	});
});

// ---------------------------------------------------------------------------
// tab:plan-dispatch with caller workspace
// ---------------------------------------------------------------------------

describe("ns:herdr:tab:plan-dispatch", () => {
	test("requires HERDR_WORKSPACE_ID; stops without tab creation if absent", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
	});

	test("rejects a whitespace-only caller ID before plan lookup or progress", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "  \t ");
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });
		const progress: string[] = [];

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: (message) => progress.push(message),
		});

		expect(pi.execCalls).toEqual([]);
		expect(progress).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe(
			"tab:plan-dispatch requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
		);
	});

	test("shows surface help without a caller ID", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--help",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"Usage: /ns:herdr:tab:plan-dispatch [--dry-run]",
		);
	});
});

// ---------------------------------------------------------------------------
// FakeHerdrGateway interface completeness
// ---------------------------------------------------------------------------

describe("FakeHerdrGateway", () => {
	test("supports createWorkspace calls", async () => {
		const herdr = new FakeHerdrGateway();
		const result = await herdr.createWorkspace({ cwd: "/tmp", label: "my-branch" });
		expect(result.type).toBe("created");
		if (result.type === "created") {
			expect(result.workspaceId).toBeTruthy();
			expect(result.rootPaneId).toBeTruthy();
		}
	});

	test("supports createTab calls", async () => {
		const herdr = new FakeHerdrGateway();
		const result = await herdr.createTab({ workspaceId: "ws-1", cwd: "/tmp", label: "tab" });
		expect(result.type).toBe("created");
		if (result.type === "created") {
			expect(result.tabId).toBeTruthy();
			expect(result.rootPaneId).toBeTruthy();
		}
	});

	test("supports runInPane calls", async () => {
		const herdr = new FakeHerdrGateway();
		const result = await herdr.runInPane("pane-1", "echo hello");
		expect(result.type).toBe("ok");
		expect(herdr.paneRunCalls).toEqual([{ paneId: "pane-1", command: "echo hello" }]);
	});

	test("records createWorkspace failure when configured", async () => {
		const herdr = new FakeHerdrGateway({
			createWorkspaceResult: { type: "failed", message: "no server running" },
		});
		const result = await herdr.createWorkspace({ cwd: "/tmp" });
		expect(result.type).toBe("failed");
	});
});

// ---------------------------------------------------------------------------
// Herdr gateway CLI wiring (extension wires up real gateway)
// ---------------------------------------------------------------------------

describe("herdr Pi extension — gateway wiring", () => {
	test("createCliHerdrGateway implements HerdrGateway interface", () => {
		const pi = new FakePi();
		const adapted = createHerdrPiCommandApi(pi);
		const gateway = createCliHerdrGateway(adapted);
		expect(typeof gateway.renameWorkspace).toBe("function");
		expect(typeof gateway.createWorkspace).toBe("function");
		expect(typeof gateway.createTab).toBe("function");
		expect(typeof gateway.runInPane).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// openBranchInHerdrWorkspace — failure paths
// ---------------------------------------------------------------------------

describe("openBranchInHerdrWorkspace — Herdr failure paths", () => {
	test("workspace create failure emits error notification and returns error", async () => {
		const pi = new FakePi({
			script: [
				// getWorktreeDescription: git remote get-url origin
				step("git", ["remote", "get-url", "origin"], {
					stdout: "git@github.com:owner/repo.git\n",
				}),
			],
		});
		const herdr = new FakeHerdrGateway({
			createWorkspaceResult: { type: "failed", message: "herdr daemon offline" },
		});
		const notifications: Array<{ message: string; level: string | undefined }> = [];

		const result = await openBranchInHerdrWorkspace({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			cwd: ROOT,
			branchName: BRANCH,
			slotClient: testSlotClient,
			notify: (message, level) => notifications.push({ message, level }),
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect("error" in result).toBe(true);
		expect(herdr.paneRunCalls).toHaveLength(0);
		expect(
			notifications.some((n) => n.level === "error" && n.message.includes("herdr daemon offline")),
		).toBe(true);
	});

	test("pane run failure after workspace create emits error notification", async () => {
		const pi = new FakePi({
			script: [
				step("git", ["remote", "get-url", "origin"], {
					stdout: "git@github.com:owner/repo.git\n",
				}),
			],
		});
		const herdr = new FakeHerdrGateway({
			paneRunResult: { type: "failed", message: "pane exec error" },
		});
		const notifications: Array<{ message: string; level: string | undefined }> = [];

		const result = await openBranchInHerdrWorkspace({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			cwd: ROOT,
			branchName: BRANCH,
			command: "pi exec pi 'hello'",
			slotClient: testSlotClient,
			notify: (message, level) => notifications.push({ message, level }),
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect("error" in result).toBe(true);
		expect(herdr.createWorkspaceCalls).toHaveLength(1);
		expect(herdr.paneRunCalls).toHaveLength(1);
		expect(
			notifications.some((n) => n.level === "error" && n.message.includes("pane exec error")),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// openBranchInHerdrCallerTab — focus semantics and failure paths
// ---------------------------------------------------------------------------

describe("openBranchInHerdrCallerTab — focus semantics", () => {
	test("creates tab with shouldFocus:true for surface dispatch", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const notifications: Array<{ message: string; level: string | undefined }> = [];

		const result = await openBranchInHerdrCallerTab({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			cwd: ROOT,
			branchName: BRANCH,
			callerWorkspaceId: "ws-caller-42",
			command: "pi exec pi 'hello'",
			tabTitle: BRANCH,
			slotClient: testSlotClient,
			notify: (message, level) => notifications.push({ message, level }),
		});

		expect(result.type).toBe("opened");
		expect(herdr.createTabCalls).toHaveLength(1);
		const tabCall = herdr.createTabCalls[0];
		expect(tabCall?.options.workspaceId).toBe("ws-caller-42");
		expect(tabCall?.options.cwd).toBe(WORKTREE);
		expect(tabCall?.options.shouldFocus).toBe(true);
		expect(herdr.paneRunCalls).toHaveLength(1);
		expect(notifications.some((n) => n.level === "error")).toBe(false);
	});

	test("tab create failure emits error notification", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({
			createTabResult: { type: "failed", message: "tab create failed" },
		});
		const notifications: Array<{ message: string; level: string | undefined }> = [];

		const result = await openBranchInHerdrCallerTab({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			cwd: ROOT,
			branchName: BRANCH,
			callerWorkspaceId: "ws-caller-42",
			command: "pi exec pi 'hello'",
			tabTitle: BRANCH,
			slotClient: testSlotClient,
			notify: (message, level) => notifications.push({ message, level }),
		});

		expect(result.type).toBe("error");
		expect(herdr.paneRunCalls).toHaveLength(0);
		expect(
			notifications.some((n) => n.level === "error" && n.message.includes("tab create failed")),
		).toBe(true);
	});

	test("pane run failure after tab create emits error notification", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway({
			paneRunResult: { type: "failed", message: "pane launch error" },
		});
		const notifications: Array<{ message: string; level: string | undefined }> = [];

		const result = await openBranchInHerdrCallerTab({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			cwd: ROOT,
			branchName: BRANCH,
			callerWorkspaceId: "ws-caller-42",
			command: "pi exec pi 'hello'",
			tabTitle: BRANCH,
			slotClient: testSlotClient,
			notify: (message, level) => notifications.push({ message, level }),
		});

		expect(result.type).toBe("error");
		expect(herdr.createTabCalls).toHaveLength(1);
		expect(herdr.paneRunCalls).toHaveLength(1);
		expect(
			notifications.some((n) => n.level === "error" && n.message.includes("pane launch error")),
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// handoff:plan dry-run — no Herdr mutations
// ---------------------------------------------------------------------------

function herdrDispatchPlanTestOptions(
	planStoreRoot: string,
): import("../src/core/dispatch-plan.ts").HerdrSlotDispatchPlanOptions {
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

describe("ns:herdr:handoff:plan — dry-run (no Herdr mutations)", () => {
	test("registered command selects a plan saved in the current Pi session", async () => {
		const repoRoot = await makeTempDir();
		const xdgStateHome = await makeTempDir();
		const planStoreRoot = join(xdgStateHome, "ns", "enriched-plan");
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, {
			content: PLAN_CONTENT,
		});
		vi.stubEnv("XDG_STATE_HOME", xdgStateHome);
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{ stdout: `${PLAN_SLUG}\n` },
				),
				headStep(),
			],
		});
		await registerHerdrPiExtension(pi);
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});

		await pi.commands.get("ns:herdr:handoff:plan")?.handler("--dry-run", ctx);

		const output = notificationMessages(ctx).join("\n");
		expect(ctx.statuses).toContainEqual({
			key: "ns:herdr:handoff:plan",
			value: "deriving branch-context slug…",
		});
		expect(output).not.toContain("No saved plan from /ns:plan:save was found");
	});

	test("dry-run shows preview without creating workspace, tab, or pane", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, {
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{
						stdout: `${PLAN_SLUG}\n`,
					},
				),
				headStep(),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--dry-run",
			ctx,
			options: herdrDispatchPlanTestOptions(planStoreRoot),
			config: {
				commandName: "ns:herdr:handoff:plan",
				statusKey: "ns:herdr:handoff:plan",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(herdr.createWorkspaceCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
		expect(herdr.paneRunCalls).toHaveLength(0);
		const dryRun = notificationMessages(ctx).find((message) => message.startsWith("Dry run"));
		if (dryRun === undefined) throw new Error("Expected a dry-run message.");
		expect(dryRun).toContain(
			"Dry run: no branch was created, no plan was attached, and no Herdr workspace was opened.",
		);
		expect(dryRun).toContain(`Path: ${planFile}`);
		expect(dryRun).toContain("Repo identity source: origin-url");
		expect(dryRun).toContain(`Source branch: ${SOURCE_BRANCH}`);
		expect(dryRun).toContain(`Branch path segment: ${SOURCE_BRANCH}`);
		expect(dryRun).toContain(`ns slot checkout ${PLAN_SLUG} --format json --no-clipboard`);
		expect(dryRun).toContain("herdr workspace create --no-focus --cwd");
		expect(dryRun).toContain(`herdr dispatch-plan from ${SOURCE_BRANCH}`);
		expect(dryRun).toContain("herdr pane run");
		expect(dryRun).toContain(`/ns:branch-context:impl-attached-plan ${PLAN_KEY}`);
		expect(dryRun).not.toContain("herdr tab create");
	});
});

describe("ns:herdr:tab:plan-dispatch — dry-run (no Herdr mutations)", () => {
	test("dry-run requires a valid caller ID before repository or plan lookup", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--dry-run",
			ctx,
			options: {},
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("captures the exact caller ID and carries it to the created tab", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "caller-workspace-exact");
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{
						stdout: `${PLAN_SLUG}\n`,
					},
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		let contextConstructions = 0;
		options.createBranchContextContext = (_commands, _cwd) => {
			contextConstructions += 1;
			return {
				commands: createHerdrPiCommandApi(pi),
				git: new InMemoryGitGateway({
					optionalRepoRoot: { type: "missing" },
					currentBranch: SOURCE_BRANCH,
					headCommit: START_POINT,
				}),
				brmem: new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
				graphite: new InMemoryGraphiteBranchGateway(),
			};
		};

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(contextConstructions).toBe(1);
		expect(herdr.createTabCalls).toHaveLength(1);
		expect(herdr.createTabCalls[0]?.options.workspaceId).toBe("caller-workspace-exact");
		expect(herdr.createTabCalls[0]?.options.shouldFocus).toBe(true);
	});

	test("workspace dispatch branch-context failure names the unopened Herdr workspace", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{
						stdout: `${PLAN_SLUG}\n`,
					},
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		options.createBranchContextContext = (_commands, _cwd) => ({
			commands: createHerdrPiCommandApi(pi),
			git: new InMemoryGitGateway({
				optionalRepoRoot: { type: "missing" },
				currentBranch: SOURCE_BRANCH,
				headCommit: START_POINT,
			}),
			brmem: new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
			graphite: new InMemoryGraphiteBranchGateway({
				trackFailure: { code: "track_failed", message: "Graphite refused tracking." },
			}),
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:handoff:plan",
				statusKey: "ns:herdr:handoff:plan",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		const failure = notificationMessages(ctx).join("\n---\n");
		expect(failure).toContain("Failed to create branch context and attach plan.");
		expect(failure).toMatch(/Source file: [^\n]+\nNo Herdr workspace was opened\.\n\n/);
		expect(failure).toContain("Graphite refused tracking.");
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("surface dispatch branch-context failure names the unopened Herdr tab", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "caller-workspace-failure");
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{
						stdout: `${PLAN_SLUG}\n`,
					},
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		options.createBranchContextContext = (_commands, _cwd) => ({
			commands: createHerdrPiCommandApi(pi),
			git: new InMemoryGitGateway({
				optionalRepoRoot: { type: "missing" },
				currentBranch: SOURCE_BRANCH,
				headCommit: START_POINT,
			}),
			brmem: new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
			graphite: new InMemoryGraphiteBranchGateway({
				trackFailure: { code: "track_failed", message: "Graphite refused tracking." },
			}),
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		const failure = notificationMessages(ctx).join("\n---\n");
		expect(failure).toContain("Failed to create branch context and attach plan.");
		expect(failure).toMatch(/Source file: [^\n]+\nNo Herdr tab was opened\.\n\n/);
		expect(failure).toContain("Graphite refused tracking.");
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("valid-ID dry-run shows surface preview without creating tab or pane", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "caller-workspace-dry-run");
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, {
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{
						stdout: `${PLAN_SLUG}\n`,
					},
				),
				headStep(),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--dry-run",
			ctx,
			options: herdrDispatchPlanTestOptions(planStoreRoot),
			config: {
				commandName: "ns:herdr:tab:plan-dispatch",
				statusKey: "ns:herdr:tab:plan-dispatch",
				destination: "surface",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(herdr.createWorkspaceCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
		expect(herdr.paneRunCalls).toHaveLength(0);
		const dryRun = notificationMessages(ctx).find((message) => message.startsWith("Dry run"));
		if (dryRun === undefined) throw new Error("Expected a dry-run message.");
		expect(dryRun).toContain(
			"Dry run: no branch was created, no plan was attached, and no Herdr surface was opened.",
		);
		expect(dryRun).toContain("Repo identity source: origin-url");
		expect(dryRun).toContain(`Branch path segment: ${SOURCE_BRANCH}`);
		expect(dryRun).toContain(`ns slot checkout ${PLAN_SLUG} --format json --no-clipboard`);
		expect(dryRun).toContain("herdr tab create --workspace");
		expect(dryRun).toContain("--focus");
		expect(dryRun).toContain(`--label ${PLAN_SLUG}`);
		expect(dryRun).toContain("herdr pane run");
		expect(dryRun).toContain(`/ns:branch-context:impl-attached-plan ${PLAN_KEY}`);
		expect(dryRun).not.toContain("herdr workspace create");
	});
});
