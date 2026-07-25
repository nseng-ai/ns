/**
 * Scenario tests for the Herdr dispatch commands:
 *  - ns:herdr:launch:prompt:space
 *  - ns:herdr:launch:plan:space
 *  - ns:herdr:launch:plan:tab
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import type { CustomMessage } from "@nseng-ai/capability-kit/pi-types";

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
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { createCliHerdrGateway } from "../src/core/cli-gateway.ts";
import {
	handleHerdrSlotDispatchPrompt,
	resolveDispatchPromptPayloadOptions,
} from "../src/core/dispatch-prompt.ts";
import { registerHerdrSlotDispatchPromptCommand } from "../src/pi/dispatch-prompt.ts";
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
const testGraphiteBranchGateway = {
	trunkBranch: async () => ({ ok: true as const, branch: TRUNK_BRANCH }),
};

function dispatchPlanDependencies() {
	return {
		git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
		graphite: testGraphiteBranchGateway,
	};
}

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

	test.each([
		{
			commandName: "ns:herdr:launch:prompt:space",
			register: registerHerdrSlotDispatchPromptCommand,
			args: "Do not launch this prompt",
			shouldSetCallerWorkspace: false,
		},
		{
			commandName: "ns:herdr:launch:plan:space",
			register: registerHerdrSlotDispatchPlanCommand,
			args: "",
			shouldSetCallerWorkspace: false,
		},
		{
			commandName: "ns:herdr:launch:plan:tab",
			register: registerHerdrSurfaceDispatchPlanCommand,
			args: "",
			shouldSetCallerWorkspace: true,
		},
	])("$commandName acknowledges before waiting for idle", async (scenario) => {
		if (scenario.shouldSetCallerWorkspace) {
			vi.stubEnv("HERDR_WORKSPACE_ID", "ack-caller-workspace");
		}
		const pi = new FakePi();
		const sentMessages: CustomMessage[] = [];
		const renderedPi = Object.create(pi) as FakePi & {
			sendMessage(message: CustomMessage): void;
		};
		renderedPi.sendMessage = (message): void => {
			sentMessages.push(message);
		};
		const ctx = new FakeCommandContext({
			shouldCancelSelect: true,
			onWaitForIdle: () => {
				expect(sentMessages[0]?.customType).toBe("ns-command-ack");
			},
		});
		scenario.register(renderedPi, {
			git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
		});

		await pi.commands.get(scenario.commandName)?.handler(scenario.args, ctx);

		expect(sentMessages[0]?.customType).toBe("ns-command-ack");
		expect(ctx.events[0]).toBe("wait-for-idle");
	});
});

// ---------------------------------------------------------------------------
// space prompt dispatch
// ---------------------------------------------------------------------------

describe("Herdr prompt dispatch", () => {
	test("stores a neutral free-form payload and launches it in the created workspace", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr dispatch flow with literal --from trunk text";
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
		const git = new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH });

		await handleHerdrSlotDispatchPrompt({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			payloadOptions: resolveDispatchPromptPayloadOptions({
				stagingDir,
				now: () => 123,
				shouldCleanupStagingFile: false,
			}),
			slotClient: testSlotClient,
			graphite: testGraphiteBranchGateway,
			git,
			args: prompt,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(git.currentBranchCalls).toEqual([{ cwd: ROOT }, { cwd: ROOT }]);
		expect(await readFile(stagedPromptFile, "utf8")).toContain(prompt);
		expect(await readFile(stagedPromptFile, "utf8")).toContain("literal --from trunk text");
		expect(herdr.createWorkspaceCalls).toEqual([{ options: { cwd: WORKTREE, label: BRANCH } }]);
		expect(herdr.paneRunCalls).toHaveLength(1);
		expect(herdr.paneRunCalls[0]?.command).toContain(
			`brmem get ${DISPATCH_PROMPT_KEY} --namespace ${DISPATCH_PROMPT_NAMESPACE} --branch ${BRANCH}`,
		);
		expect(notificationMessages(ctx).join("\n")).toContain(
			`${DISPATCH_PROMPT_NAMESPACE}/${DISPATCH_PROMPT_KEY}`,
		);
	});

	test("dispatches from local trunk through the neutral payload", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr trunk flow";
		const pi = new FakePi({
			script: [
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
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
				step("git", ["branch", BRANCH, START_POINT], {}),
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

		await handleHerdrSlotDispatchPrompt({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			payloadOptions: resolveDispatchPromptPayloadOptions({
				stagingDir,
				now: () => 123,
				shouldCleanupStagingFile: false,
			}),
			graphite: { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) },
			git: {
				currentBranch: async () => ({ type: "branch", branch: TRUNK_BRANCH }),
			},
			slotClient: testSlotClient,
			args: prompt,
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(ctx.selections).toEqual([]);
		expect(await readFile(stagedPromptFile, "utf8")).toContain(
			"created from the existing local Graphite trunk",
		);
		expect(herdr.createWorkspaceCalls).toHaveLength(1);
		expect(herdr.createWorkspaceCalls[0]?.options.label).toBe(BRANCH);
		const slugCalls = pi.execCalls.filter((call) => call.command === "pi");
		expect(slugCalls).toHaveLength(1);
		expect(slugCalls[0]?.options?.cwd).toBe(ROOT);
		expect(slugCalls[0]?.args.at(-1)).toContain("Generate a concise git branch slug");
		expect(slugCalls[0]?.args.at(-1)).toContain(prompt);
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
			graphite: testGraphiteBranchGateway,
			git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
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

	test("cancels branch-basis selection without mutation", async () => {
		const stagingDir = await makeTempDir();
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT, shouldCancelSelect: true });

		await handleHerdrSlotDispatchPrompt({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			payloadOptions: resolveDispatchPromptPayloadOptions({ stagingDir }),
			graphite: testGraphiteBranchGateway,
			git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
			args: "Do not dispatch this prompt",
			ctx,
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Herdr launch cancelled.");
	});
});

// ---------------------------------------------------------------------------
// space and tab plan dispatch
// ---------------------------------------------------------------------------

describe("ns:herdr:launch:plan:space", () => {
	test("shows help without side-effects on --help", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--help",
			ctx,
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
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
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toHaveLength(0);
		const errors = ctx.notifications.filter((n) => n.level === "error");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]?.message).toContain("Unknown flag");
	});

	test("registers space and tab plan dispatch and launch:plan:tab via Pi adapter", () => {
		const pi = new FakePi();
		registerHerdrSlotDispatchPlanCommand(pi);
		registerHerdrSurfaceDispatchPlanCommand(pi);
		expect(pi.commands.has("ns:herdr:launch:plan:space")).toBe(true);
		expect(pi.commands.has("ns:herdr:launch:plan:tab")).toBe(true);
	});

	test("launch:plan:tab requires HERDR_WORKSPACE_ID", async () => {
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
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
		expect(ctx.notifications).toContainEqual({
			message:
				"launch:plan:tab requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
			level: "error",
		});
	});
});

// ---------------------------------------------------------------------------
// launch:plan:tab with caller workspace
// ---------------------------------------------------------------------------

describe("ns:herdr:launch:plan:tab", () => {
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
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
	});

	test("resolves an invalid tab destination atomically before branch-context mutation", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
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
					{ stdout: `${PLAN_SLUG}\n` },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
		});
		const brmem = new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});
		const destinationReads: Array<"workspace" | "tab"> = ["tab", "workspace", "tab"];

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				get destination() {
					return destinationReads.shift() ?? "tab";
				},
			},
			notifyProgress: () => {},
		});

		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe(
			"launch:plan:tab requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
		);
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
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: (message) => progress.push(message),
		});

		expect(pi.execCalls).toEqual([]);
		expect(progress).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe(
			"launch:plan:tab requires HERDR_WORKSPACE_ID. Not running inside a Herdr caller workspace.",
		);
	});

	test("shows tab help without a caller ID", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", undefined);
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--help",
			ctx,
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"Usage: /ns:herdr:launch:plan:tab [--dry-run]",
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
// plan dispatch dry-run — no Herdr mutations
// ---------------------------------------------------------------------------

function herdrDispatchPlanTestOptions(
	planStoreRoot: string,
): import("../src/core/dispatch-plan.ts").ResolvedHerdrSlotDispatchPlanOptions {
	return {
		planStoreRoot,
		slotClient: testSlotClient,
		graphite: testGraphiteBranchGateway,
		git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
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

describe("ns:herdr:launch:plan:space", () => {
	test("executes from local exact SHA with explicit Graphite parent and inherited collision suffix", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{ stdout: `${PLAN_SLUG}\n` },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		const git = new InMemoryGitGateway({
			optionalRepoRoot: { type: "missing" },
			existingBranches: [PLAN_SLUG],
		});
		const brmem = new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const graphite = new InMemoryGraphiteBranchGateway();
		options.graphite = { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) };
		options.git = {
			currentBranch: async () => ({ type: "branch", branch: SOURCE_BRANCH }),
		};
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			brmem,
			graphite,
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: repoRoot, branch: `${PLAN_SLUG}-2`, startPoint: START_POINT },
		]);
		expect(graphite.trackBranchCalls).toEqual([
			{ cwd: repoRoot, branch: `${PLAN_SLUG}-2`, parentBranch: TRUNK_BRANCH },
		]);
		expect(brmem.attachPlanCalls[0]).toMatchObject({ branch: `${PLAN_SLUG}-2`, key: PLAN_KEY });
		expect(herdr.createWorkspaceCalls).toEqual([{ options: { cwd: WORKTREE, label: PLAN_SLUG } }]);
		expect(herdr.paneRunCalls).toHaveLength(1);
		const messages = notificationMessages(ctx).join("\n");
		expect(messages).toContain(`Start point: ${START_POINT}`);
		expect(messages).toContain(`Start ref: refs/heads/${TRUNK_BRANCH}`);
		expect(messages).toContain(`Graphite parent: ${TRUNK_BRANCH}`);
		expect(messages).toContain(`Selected target branch: ${PLAN_SLUG}-2`);
	});

	test("fails without a session saved plan before trunk preparation or mutation", async () => {
		const pi = new FakePi({ script: dispatchValidationScript(ROOT) });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT, branchEntries: [] });

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).toEqual([
			["rev-parse", "--show-toplevel"],
			["branch", "--show-current"],
			["config", "--get", "remote.origin.url"],
		]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain("saved plan");
	});

	test("trunk preparation failure stops before branch, attachment, slot, or Herdr mutation", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					code: 1,
					stderr: "unknown revision",
				}),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const git = new InMemoryGitGateway();
		const brmem = new InMemoryBranchMemoryGateway();
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		options.graphite = { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) };
		options.git = {
			currentBranch: async () => ({ type: "branch", branch: SOURCE_BRANCH }),
		};
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain(
			`Could not resolve local Graphite trunk ${TRUNK_BRANCH}`,
		);
	});

	test("dry-run previews the explicit local-trunk basis without any mutation", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{ stdout: `${PLAN_SLUG}\n` },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		const git = new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } });
		const brmem = new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		options.graphite = { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) };
		options.git = {
			currentBranch: async () => ({ type: "branch", branch: SOURCE_BRANCH }),
		};
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--dry-run",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		const dryRun = notificationMessages(ctx).find((message) => message.startsWith("Dry run"));
		if (dryRun === undefined) throw new Error("Expected a dry-run message.");
		expect(dryRun).toContain(`Trunk branch / Graphite parent: ${TRUNK_BRANCH}`);
		expect(dryRun).toContain(`Local start ref: refs/heads/${TRUNK_BRANCH}`);
		expect(dryRun).toContain(`Local start point: ${START_POINT}`);
		expect(dryRun).toContain(`git branch ${PLAN_SLUG} ${START_POINT}`);
		expect(dryRun).toContain(`--parent ${TRUNK_BRANCH}`);
	});
});

describe("ns:herdr:launch:plan:space — dry-run (no Herdr mutations)", () => {
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
				step("git", ["branch", "--show-current"], { stdout: `${SOURCE_BRANCH}\n` }),
				...dispatchValidationScript(repoRoot),
				step("git", ["branch", "--show-current"], { stdout: `${SOURCE_BRANCH}\n` }),
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

		await pi.commands.get("ns:herdr:launch:plan:space")?.handler("--dry-run", ctx);

		const output = notificationMessages(ctx).join("\n");
		expect(ctx.statuses).toContainEqual({
			key: "ns:herdr:launch:plan:space",
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
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
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
		expect(dryRun).toContain(`Workspace label: [sN:]${PLAN_SLUG}`);
		expect(dryRun).toContain(`--label '<optional-compact-slot-prefix>${PLAN_SLUG}'`);
		expect(dryRun).not.toContain(`herdr dispatch-plan from ${SOURCE_BRANCH}`);
		expect(dryRun).toContain("herdr pane run");
		expect(dryRun).toContain(`/ns:branch-context:impl-attached-plan ${PLAN_KEY}`);
		expect(dryRun).not.toContain("herdr tab create");
	});
});

describe("ns:herdr:launch:plan:tab — dry-run (no Herdr mutations)", () => {
	test("executes from local trunk using the caller workspace captured before interaction", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "caller-workspace-before-interaction");
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{ stdout: `${PLAN_SLUG}\n` },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
			onWaitForIdle: () => vi.stubEnv("HERDR_WORKSPACE_ID", "caller-workspace-after-interaction"),
		});
		const git = new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } });
		const brmem = new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const graphite = new InMemoryGraphiteBranchGateway();
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		options.graphite = { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) };
		options.git = {
			currentBranch: async () => ({ type: "branch", branch: SOURCE_BRANCH }),
		};
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			brmem,
			graphite,
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: repoRoot, branch: PLAN_SLUG, startPoint: START_POINT },
		]);
		expect(graphite.trackBranchCalls).toEqual([
			{ cwd: repoRoot, branch: PLAN_SLUG, parentBranch: TRUNK_BRANCH },
		]);
		expect(brmem.attachPlanCalls[0]).toMatchObject({ branch: PLAN_SLUG, key: PLAN_KEY });
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "caller-workspace-before-interaction",
					cwd: WORKTREE,
					label: PLAN_SLUG,
					shouldFocus: true,
				},
			},
		]);
		expect(notificationMessages(ctx).join("\n")).toContain(`Start point: ${START_POINT}`);
		expect(notificationMessages(ctx).join("\n")).toContain(`Graphite parent: ${TRUNK_BRANCH}`);
	});

	test("local-trunk dry-run previews the tab launch without fetching or mutating", async () => {
		vi.stubEnv("HERDR_WORKSPACE_ID", "caller-workspace-dry-run-trunk");
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...dispatchValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				gitRootStep(repoRoot),
				step(
					"pi",
					buildRawTextModelArgs(buildPlanContentSlugPrompt(PLAN_CONTENT), TEST_MODEL_SELECTION),
					{ stdout: `${PLAN_SLUG}\n` },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const git = new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } });
		const brmem = new InMemoryBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const graphite = new InMemoryGraphiteBranchGateway();
		const options = herdrDispatchPlanTestOptions(planStoreRoot);
		options.graphite = { trunkBranch: async () => ({ ok: true, branch: TRUNK_BRANCH }) };
		options.git = {
			currentBranch: async () => ({ type: "branch", branch: SOURCE_BRANCH }),
		};
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			brmem,
			graphite,
		});

		await handleHerdrSlotDispatchPlan({
			pi: createHerdrPiCommandApi(pi),
			herdr,
			rawArgs: "--dry-run",
			ctx,
			options,
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(pi.execCalls).not.toContainEqual(
			expect.objectContaining({ command: "git", args: expect.arrayContaining(["fetch"]) }),
		);
		expect(git.createBranchAtHeadCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(graphite.trackBranchCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		const dryRun = notificationMessages(ctx).find((message) => message.startsWith("Dry run"));
		if (dryRun === undefined) throw new Error("Expected a dry-run message.");
		expect(dryRun).toContain(`Trunk branch / Graphite parent: ${TRUNK_BRANCH}`);
		expect(dryRun).toContain(`Local start ref: refs/heads/${TRUNK_BRANCH}`);
		expect(dryRun).toContain(`Local start point: ${START_POINT}`);
		expect(dryRun).toContain(`git branch ${PLAN_SLUG} ${START_POINT}`);
		expect(dryRun).toContain(`--parent ${TRUNK_BRANCH}`);
		expect(dryRun).toContain(
			`herdr tab create --workspace '<caller-workspace>' --focus --cwd '<slot-worktree-path>' --label ${PLAN_SLUG}`,
		);
	});

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
			options: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
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
					existingBranches: [PLAN_SLUG],
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
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(contextConstructions).toBe(1);
		expect(herdr.createTabCalls).toHaveLength(1);
		expect(herdr.createTabCalls[0]?.options).toMatchObject({
			workspaceId: "caller-workspace-exact",
			label: PLAN_SLUG,
			shouldFocus: true,
		});
		expect(notificationMessages(ctx).join("\n")).toContain(`Branch: ${PLAN_SLUG}-2`);
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
				commandName: "ns:herdr:launch:plan:space",
				statusKey: "ns:herdr:launch:plan:space",
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

	test("tab dispatch branch-context failure names the unopened Herdr tab", async () => {
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
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
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

	test("valid-ID dry-run shows tab preview without creating tab or pane", async () => {
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
				commandName: "ns:herdr:launch:plan:tab",
				statusKey: "ns:herdr:launch:plan:tab",
				destination: "tab",
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
			"Dry run: no branch was created, no plan was attached, and no Herdr tab was opened.",
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
