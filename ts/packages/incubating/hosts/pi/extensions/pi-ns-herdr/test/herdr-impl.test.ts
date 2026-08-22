/**
 * Scenario tests for the Herdr implementation commands:
 *  - ns:herdr:impl:prompt:space
 *  - ns:herdr:impl:prompt:tab
 *  - ns:herdr:impl:plan:space
 *  - ns:herdr:impl:plan:tab
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import type { CustomMessage } from "@nseng-ai/extension-kit/pi-types";

import { HERDR_COMMAND_NAMES } from "@nseng-ai/herdr/api";
import registerHerdrPiExtension from "../src/pi/extension.ts";
import {
	registerHerdrPlanSpaceImplCommand,
	registerHerdrPlanTabImplCommand,
} from "../src/pi/impl-plan.ts";
import { handleHerdrSlotImplPlan, type HerdrSlotImplPlanOptions } from "../src/core/impl-plan.ts";
import { HERDR_IMPL_PROMPT_BRANCH_ENV } from "../src/core/impl-prompt-launch.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import { createCliHerdrGateway } from "@nseng-ai/herdr/api";
import {
	handleHerdrSlotImplPrompt,
	resolveImplPromptPayloadOptions,
} from "../src/core/impl-prompt.ts";
import {
	registerHerdrPromptSpaceImplCommand,
	registerHerdrPromptTabImplCommand,
} from "../src/pi/impl-prompt.ts";
import { FakeBrmemGateway } from "@nseng-ai/brmem";

class TrackingBranchMemoryGateway extends FakeBrmemGateway {
	readonly attachPlanCalls: Array<Parameters<FakeBrmemGateway["putEntry"]>[0]> = [];

	override async putEntry(options: Parameters<FakeBrmemGateway["putEntry"]>[0]) {
		this.attachPlanCalls.push({ ...options });
		return await super.putEntry(options);
	}

	override async createEntry(options: Parameters<FakeBrmemGateway["createEntry"]>[0]) {
		this.attachPlanCalls.push({ ...options });
		return await super.createEntry(options);
	}
}
import { createBranchContextContext } from "@nseng-ai/branch-context/api";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/extension-kit/graphite/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { StdinCapableCommandExecApi } from "@nseng-ai/foundation/command";

import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	failedCallerPane,
	focusedModelStep,
	makeTempDir,
	notificationMessages,
	resetHerdrTestEnvironment,
	resolvedCallerPane,
	ROOT,
	step,
	WORKTREE,
	BRANCH,
	PLAN_CONTENT,
	PLAN_SLUG,
	PLAN_KEY,
	SOURCE_BRANCH,
	START_POINT,
	implValidationScript,
	headStep,
	writePlanStoreFile,
	savedPlanEntry,
} from "./herdr-test-harness.ts";

afterEach(resetHerdrTestEnvironment);

const IMPL_PROMPT_NAMESPACE = "ns-impl";
const IMPL_PROMPT_KEY = "prompt.md";
const TRUNK_BRANCH = "master";
const TEST_PROJECT_CONFIG = {
	readTextFile: () => ({
		type: "found" as const,
		text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
	}),
	pathExists: () => ({ type: "missing" as const }),
};
function dispatchPlanDependencies() {
	return {};
}

function callerSpaceFailureMessage(commandName: string): string {
	const failure = failedCallerPane();
	const failureMessage = failure.type === "failed" ? failure.message : "";
	return `/${commandName} requires a Herdr caller space, but the caller workspace could not be resolved.\n${failureMessage}`;
}

function herdrPiTestContext(
	pi: FakePi,
	herdr: FakeHerdrGateway,
	git: InMemoryGitGateway = new InMemoryGitGateway({
		currentBranch: SOURCE_BRANCH,
		cachedOriginHeadBranch: TRUNK_BRANCH,
	}),
) {
	return {
		commands: createHerdrPiCommandApi(pi),
		git,
		projectConfig: TEST_PROJECT_CONFIG,
		herdr,
	};
}

interface HerdrPlanTestContextOptions {
	pi: FakePi;
	ctx: FakeCommandContext;
	herdr: FakeHerdrGateway;
	git?: InMemoryGitGateway;
}

function herdrPlanTestContext(options: HerdrPlanTestContextOptions) {
	return {
		...herdrPiTestContext(options.pi, options.herdr, options.git),
		pi: options.ctx,
	};
}

function brmemCheckJson(isPresent: boolean): string {
	return JSON.stringify({ exitCode: 0, data: { present: isPresent } });
}

function implPromptPutJson(sourceFile: string): string {
	return JSON.stringify({
		exitCode: 0,
		data: {
			namespace: IMPL_PROMPT_NAMESPACE,
			key: IMPL_PROMPT_KEY,
			branch: BRANCH,
			refName: `refs/brmem/ns/${IMPL_PROMPT_NAMESPACE}/${BRANCH}:${IMPL_PROMPT_KEY}`,
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
	test("registers all herdr command surfaces", async () => {
		const pi = new FakePi();
		await registerHerdrPiExtension(pi);
		expect([...pi.commands.keys()].sort()).toEqual([...HERDR_COMMAND_NAMES].sort());
	});

	test.each([
		{
			commandName: "ns:herdr:impl:prompt:space",
			register: registerHerdrPromptSpaceImplCommand,
			args: "Do not implement this prompt",
		},
		{
			commandName: "ns:herdr:impl:prompt:tab",
			register: registerHerdrPromptTabImplCommand,
			args: "Do not implement this prompt",
		},
		{
			commandName: "ns:herdr:impl:plan:space",
			register: registerHerdrPlanSpaceImplCommand,
			args: "",
		},
		{
			commandName: "ns:herdr:impl:plan:tab",
			register: registerHerdrPlanTabImplCommand,
			args: "",
		},
	])("$commandName acknowledges before waiting for idle", async (scenario) => {
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
		const commands = createHerdrPiCommandApi(renderedPi);
		scenario.register({
			commands,
			git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
			projectConfig: TEST_PROJECT_CONFIG,
			herdr: new FakeHerdrGateway(),
		});

		await pi.commands.get(scenario.commandName)?.handler(scenario.args, ctx);

		expect(sentMessages[0]?.customType).toBe("ns-command-ack");
		expect(ctx.events[0]).toBe("wait-for-idle");
	});
});

// ---------------------------------------------------------------------------
// space prompt implementation
// ---------------------------------------------------------------------------

describe("Herdr prompt implementation", () => {
	test("stores a neutral free-form payload and launches it in the created workspace", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr implementation flow with literal --from trunk text";
		const pi = new FakePi({
			script: [
				focusedModelStep(prompt, "tracked-branch", { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
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
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{ stdout: implPromptPutJson(stagedPromptFile) },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });
		const git = new InMemoryGitGateway({
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
			repoRoot: ROOT,
		});

		await handleHerdrSlotImplPrompt(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				herdr,
				git,
				projectConfig: TEST_PROJECT_CONFIG,
			},
			{
				payloadOptions: resolveImplPromptPayloadOptions({
					stagingDir,
					now: () => 123,
					shouldCleanupStagingFile: false,
				}),
				slotClient: testSlotClient,
				args: prompt,
				commandName: "ns:herdr:impl:prompt:space",
				destination: { type: "workspace" },
				notifyProgress: () => {},
			},
		);

		pi.assertDone();
		expect(git.cachedOriginHeadBranchCalls).toEqual([]);
		expect(git.currentBranchCalls).toEqual([{ cwd: ROOT }, { cwd: ROOT }, { cwd: ROOT }]);
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: ROOT, branch: BRANCH, startPoint: START_POINT },
		]);
		expect(await readFile(stagedPromptFile, "utf8")).toContain(prompt);
		expect(await readFile(stagedPromptFile, "utf8")).toContain("literal --from trunk text");
		expect(herdr.createWorkspaceCalls, notificationMessages(ctx).join("\n")).toEqual([
			{ options: { cwd: WORKTREE, label: `s1:${BRANCH}` } },
		]);
		expect(herdr.paneRunCalls).toHaveLength(1);
		const paneCommand = herdr.paneRunCalls[0]?.command ?? "";
		expect(paneCommand).toBe(`${HERDR_IMPL_PROMPT_BRANCH_ENV}=${BRANCH} exec pi --thinking medium`);
		expect(paneCommand).not.toContain(prompt);
		expect(paneCommand).not.toContain("brmem");
		expect(paneCommand).not.toContain("mktemp");
		expect(paneCommand).not.toContain("payload_dir");
		expect(paneCommand).not.toContain("@");
		expect(paneCommand).not.toContain("--fork");
		expect(notificationMessages(ctx).join("\n")).toContain(
			`${IMPL_PROMPT_NAMESPACE}/${IMPL_PROMPT_KEY}`,
		);
		expect(notificationMessages(ctx).join("\n")).toContain(`Destination worktree: ${WORKTREE}`);
	});

	test("prompt-tab captures the caller workspace and launches the stored payload in a focused Slot tab", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement this prompt in a caller tab";
		const pi = new FakePi({
			script: [
				focusedModelStep(prompt, "tracked-branch", { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
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
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{ stdout: implPromptPutJson(stagedPromptFile) },
				),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: ROOT,
			// The caller space is resolved exactly once, before idle waiting; later
			// gateway state cannot change the captured identity.
			onWaitForIdle: () => expect(herdr.resolveCallerPaneCalls).toBe(1),
		});
		registerHerdrPromptTabImplCommand(
			{
				commands: createHerdrPiCommandApi(pi),
				git: new InMemoryGitGateway({
					currentBranch: SOURCE_BRANCH,
					headCommit: START_POINT,
					repoRoot: ROOT,
				}),
				projectConfig: TEST_PROJECT_CONFIG,
				herdr,
			},
			{
				stagingDir,
				now: () => 123,
				shouldCleanupStagingFile: false,
				slotClient: testSlotClient,
			},
		);

		await pi.commands.get("ns:herdr:impl:prompt:tab")?.handler(prompt, ctx);

		pi.assertDone();
		expect(herdr.resolveCallerPaneCalls).toBe(1);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "caller-workspace",
					cwd: WORKTREE,
					label: BRANCH,
					shouldFocus: true,
				},
			},
		]);
		expect(herdr.paneRunCalls).toHaveLength(1);
		const paneCommand = herdr.paneRunCalls[0]?.command ?? "";
		expect(paneCommand).toBe(`${HERDR_IMPL_PROMPT_BRANCH_ENV}=${BRANCH} exec pi --thinking medium`);
		expect(paneCommand).not.toContain("brmem");
		expect(paneCommand).not.toContain("--fork");
		expect(notificationMessages(ctx).join("\n")).toContain(`Opened Herdr tab: ${BRANCH}`);
		expect(notificationMessages(ctx).join("\n")).toContain(`Destination worktree: ${WORKTREE}`);
	});

	test("prompt-tab stops before any workflow work when caller resolution fails", async () => {
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const git = new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH });
		let slotCalls = 0;
		registerHerdrPromptTabImplCommand(
			{
				commands: createHerdrPiCommandApi(pi),
				git,
				projectConfig: TEST_PROJECT_CONFIG,
				herdr,
			},
			{
				slotClient: {
					async checkoutCurrent() {
						slotCalls += 1;
						return await testSlotClient.checkoutCurrent();
					},
					async checkoutBranch(options) {
						slotCalls += 1;
						return await testSlotClient.checkoutBranch(options);
					},
				},
			},
		);
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await pi.commands.get("ns:herdr:impl:prompt:tab")?.handler("Implement this", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(0);
		expect(pi.execCalls).toEqual([]);
		expect(git.currentBranchCalls).toEqual([]);
		expect(git.cachedOriginHeadBranchCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(slotCalls).toBe(0);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(notificationMessages(ctx).at(-1)).toBe(
			callerSpaceFailureMessage("ns:herdr:impl:prompt:tab"),
		);
	});

	test("implements from local trunk through the neutral payload", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr trunk flow";
		const pi = new FakePi({
			script: [
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				focusedModelStep(prompt, "tracked-branch", { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("gt", ["track", BRANCH, "--parent", TRUNK_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
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
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
						"--branch",
						BRANCH,
						"--file",
						stagedPromptFile,
						"--format",
						"json",
					],
					{ stdout: implPromptPutJson(stagedPromptFile) },
				),
			],
		});
		const git = new InMemoryGitGateway({
			currentBranch: TRUNK_BRANCH,
			cachedOriginHeadBranch: TRUNK_BRANCH,
			repoRoot: ROOT,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPrompt(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				herdr,
				git,
				projectConfig: TEST_PROJECT_CONFIG,
			},
			{
				payloadOptions: resolveImplPromptPayloadOptions({
					stagingDir,
					now: () => 123,
					shouldCleanupStagingFile: false,
				}),
				slotClient: testSlotClient,
				args: prompt,
				commandName: "ns:herdr:impl:prompt:space",
				destination: { type: "workspace" },
				notifyProgress: () => {},
			},
		);

		pi.assertDone();
		expect(git.cachedOriginHeadBranchCalls).toEqual([{ cwd: ROOT }]);
		expect(ctx.selections).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: ROOT, branch: BRANCH, startPoint: START_POINT },
		]);
		expect(await readFile(stagedPromptFile, "utf8")).toContain(
			"created from the existing local Graphite trunk",
		);
		expect(herdr.createWorkspaceCalls).toHaveLength(1);
		expect(herdr.createWorkspaceCalls[0]?.options.label).toBe(`s1:${BRANCH}`);
		const slugCalls = pi.execCalls.filter((call) => call.command === "pi");
		expect(slugCalls).toHaveLength(1);
		expect(slugCalls[0]?.options?.cwd).toBe(ROOT);
		expect(slugCalls[0]?.args.at(-1)).toContain("Generate a concise git branch slug");
		expect(slugCalls[0]?.args.at(-1)).toContain(prompt);
		expect(herdr.paneRunCalls[0]?.command).toContain(
			`${HERDR_IMPL_PROMPT_BRANCH_ENV}=${BRANCH} exec pi`,
		);
		expect(herdr.paneRunCalls[0]?.command).not.toContain("brmem");
	});

	test("trunk resolution failure stops the prompt implementation before any mutation", async () => {
		const stagingDir = await makeTempDir();
		const pi = new FakePi({ script: [] });
		const git = new InMemoryGitGateway({
			currentBranch: TRUNK_BRANCH,
			cachedOriginHeadBranch: { type: "missing" },
			repoRoot: ROOT,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPrompt(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				herdr,
				git,
				projectConfig: TEST_PROJECT_CONFIG,
			},
			{
				payloadOptions: resolveImplPromptPayloadOptions({ stagingDir }),
				slotClient: testSlotClient,
				args: "Implement the Herdr trunk flow",
				commandName: "ns:herdr:impl:prompt:space",
				destination: { type: "workspace" },
				notifyProgress: () => {},
			},
		);

		pi.assertDone();
		expect(git.cachedOriginHeadBranchCalls).toEqual([{ cwd: ROOT }]);
		expect(pi.execCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(
			ctx.notifications.some(
				(n) =>
					n.level === "error" && n.message.includes("refs/remotes/origin/HEAD is not set locally"),
			),
		).toBe(true);
	});

	test("does not create a Herdr tab when payload storage fails", async () => {
		const stagingDir = await makeTempDir();
		const stagedPromptFile = join(stagingDir, `123-${BRANCH}.md`);
		const prompt = "Implement the Herdr implementation flow";
		const pi = new FakePi({
			script: [
				focusedModelStep(prompt, "tracked-branch", { stdout: `${BRANCH}\n` }),
				step("git", ["show-ref", "--verify", "--quiet", `refs/heads/${BRANCH}`], { code: 1 }),
				step("gt", ["track", BRANCH, "--parent", SOURCE_BRANCH, "--no-interactive"], {}),
				step(
					"brmem",
					[
						"check",
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
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
						IMPL_PROMPT_KEY,
						"--namespace",
						IMPL_PROMPT_NAMESPACE,
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
		const git = new InMemoryGitGateway({
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
			repoRoot: ROOT,
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPrompt(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				herdr,
				git,
				projectConfig: TEST_PROJECT_CONFIG,
			},
			{
				payloadOptions: resolveImplPromptPayloadOptions({ stagingDir, now: () => 123 }),
				slotClient: testSlotClient,
				args: prompt,
				commandName: "ns:herdr:impl:prompt:tab",
				destination: { type: "tab", callerWorkspaceId: "caller-workspace" },
				notifyProgress: () => {},
			},
		);

		pi.assertDone();
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"failed to store implementation prompt payload in Branch Memory",
		);
		expect(notificationMessages(ctx).join("\n")).toContain("No Herdr tab was opened.");
	});

	test("cancels branch-basis selection without mutation", async () => {
		const stagingDir = await makeTempDir();
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT, shouldCancelSelect: true });

		await handleHerdrSlotImplPrompt(
			{
				commands: createHerdrPiCommandApi(pi),
				pi: ctx,
				herdr,
				git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
				projectConfig: TEST_PROJECT_CONFIG,
			},
			{
				payloadOptions: resolveImplPromptPayloadOptions({ stagingDir }),
				args: "Do not implement this prompt",
				commandName: "ns:herdr:impl:prompt:space",
				destination: { type: "workspace" },
				notifyProgress: () => {},
			},
		);

		pi.assertDone();
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Herdr implementation cancelled.");
	});
});

// ---------------------------------------------------------------------------
// space and tab plan implementation
// ---------------------------------------------------------------------------

describe("ns:herdr:impl:plan:space", () => {
	test("shows help without side-effects on --help", async () => {
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--help",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
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

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--unknown-flag",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toHaveLength(0);
		const errors = ctx.notifications.filter((n) => n.level === "error");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]?.message).toContain("Unknown flag");
	});

	test("registers space and tab plan implementation and impl:plan:tab via Pi adapter", () => {
		const pi = new FakePi();
		const dependencies = herdrPiTestContext(pi, new FakeHerdrGateway());
		registerHerdrPlanSpaceImplCommand(dependencies);
		registerHerdrPlanTabImplCommand(dependencies);
		expect(pi.commands.has("ns:herdr:impl:plan:space")).toBe(true);
		expect(pi.commands.has("ns:herdr:impl:plan:tab")).toBe(true);
	});

	test("impl:plan:tab stops when the caller space cannot be resolved", async () => {
		const repoRoot = await makeTempDir();
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
		expect(ctx.notifications).toContainEqual({
			message: callerSpaceFailureMessage("ns:herdr:impl:plan:tab"),
			level: "error",
		});
	});
});

// ---------------------------------------------------------------------------
// impl:plan:tab with caller workspace
// ---------------------------------------------------------------------------

describe("ns:herdr:impl:plan:tab", () => {
	test("stops without tab creation when caller resolution fails", async () => {
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toHaveLength(0);
		expect(herdr.createTabCalls).toHaveLength(0);
	});

	test("resolves an invalid tab destination atomically before branch-context mutation", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const git = new InMemoryGitGateway({
			optionalRepoRoot: repoRoot,
			currentBranch: SOURCE_BRANCH,
			headCommit: START_POINT,
		});
		const brmem = new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});
		const destinationReads: Array<"workspace" | "tab"> = ["tab", "workspace", "tab"];

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
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
			callerSpaceFailureMessage("ns:herdr:impl:plan:tab"),
		);
	});

	test("caller resolution failure stops before plan lookup or progress", async () => {
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext({ cwd: ROOT });
		const progress: string[] = [];

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
				destination: "tab",
			},
			notifyProgress: (message) => progress.push(message),
		});

		expect(pi.execCalls).toEqual([]);
		expect(progress).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe(
			callerSpaceFailureMessage("ns:herdr:impl:plan:tab"),
		);
	});

	test("shows tab help without resolving the caller space", async () => {
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--help",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.resolveCallerPaneCalls).toBe(0);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"Usage: /ns:herdr:impl:plan:tab [--dry-run]",
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
// plan implementation dry-run — no Herdr mutations
// ---------------------------------------------------------------------------

function herdrPlanImplTestOptions(planStoreRoot: string): HerdrSlotImplPlanOptions {
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
				projectConfig: TEST_PROJECT_CONFIG,
				brmem: new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
			};
		},
	};
}

describe("ns:herdr:impl:plan:space", () => {
	test("executes from local exact SHA with explicit Graphite parent and inherited collision suffix", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrPlanImplTestOptions(planStoreRoot);
		const git = new InMemoryGitGateway({
			optionalRepoRoot: repoRoot,
			existingBranches: [PLAN_SLUG],
			branchUpstream: {
				remoteName: "origin",
				remoteRef: `refs/heads/${TRUNK_BRANCH}`,
			},
		});
		const brmem = new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const graphite = new InMemoryGraphiteBranchGateway();
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite,
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
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
		expect(herdr.createWorkspaceCalls).toEqual([
			{ options: { cwd: WORKTREE, label: `s1:${PLAN_SLUG}-2` } },
		]);
		expect(herdr.paneRunCalls).toHaveLength(1);
		const messages = notificationMessages(ctx).join("\n");
		expect(messages).toContain(`Start point: ${START_POINT}`);
		expect(messages).toContain(`Start ref: refs/heads/${TRUNK_BRANCH}`);
		expect(messages).toContain(`Graphite parent: ${TRUNK_BRANCH}`);
		expect(messages).toContain(`Selected target branch: ${PLAN_SLUG}-2`);
	});

	test("fails without a session saved plan before trunk preparation or mutation", async () => {
		const pi = new FakePi({ script: implValidationScript(ROOT) });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({ cwd: ROOT, branchEntries: [] });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
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
				...implValidationScript(repoRoot),
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
		const git = new InMemoryGitGateway({ branchUpstream: { type: "missing" } });
		const brmem = new TrackingBranchMemoryGateway();
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
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

	test("trunk resolution failure stops before trunk preparation, branch, attachment, slot, or Herdr mutation", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({ script: implValidationScript(repoRoot) });
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const git = new InMemoryGitGateway({ branchUpstream: { type: "missing" } });
		const brmem = new TrackingBranchMemoryGateway();
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});
		const contextGit = new InMemoryGitGateway({ cachedOriginHeadBranch: { type: "missing" } });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr, git: contextGit }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		expect(contextGit.cachedOriginHeadBranchCalls).toEqual([{ cwd: repoRoot }]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
		expect(brmem.attachPlanCalls).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain(
			"refs/remotes/origin/HEAD is not set locally",
		);
	});

	test("dry-run previews the explicit local-trunk basis without any mutation", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrPlanImplTestOptions(planStoreRoot);
		const git = new InMemoryGitGateway({ optionalRepoRoot: repoRoot });
		const brmem = new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite: new InMemoryGraphiteBranchGateway(),
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--dry-run",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
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

describe("ns:herdr:impl:plan:space — dry-run (no Herdr mutations)", () => {
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
				...implValidationScript(repoRoot),
				step("git", ["branch", "--show-current"], { stdout: `${SOURCE_BRANCH}\n` }),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
				headStep(),
			],
		});
		await registerHerdrPiExtension(pi);
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});

		await pi.commands.get("ns:herdr:impl:plan:space")?.handler("--dry-run", ctx);

		const output = notificationMessages(ctx).join("\n");
		expect(ctx.statuses).toContainEqual({
			key: "ns:herdr:impl:plan:space",
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
				...implValidationScript(repoRoot),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
				headStep(),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--dry-run",
			dependencies: herdrPlanImplTestOptions(planStoreRoot),
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
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
			"Dry run: no branch was created, no plan was attached, and no Herdr space was opened.",
		);
		expect(dryRun).toContain(`Path: ${planFile}`);
		expect(dryRun).toContain("Repo identity source: origin-url");
		expect(dryRun).toContain(`Source branch: ${SOURCE_BRANCH}`);
		expect(dryRun).toContain(`Branch path segment: ${SOURCE_BRANCH}`);
		expect(dryRun).toContain(`ns slot checkout ${PLAN_SLUG} --format json --no-clipboard`);
		expect(dryRun).toContain("herdr workspace create --no-focus --cwd");
		expect(dryRun).toContain(`Workspace label: [sN:]${PLAN_SLUG}`);
		expect(dryRun).toContain(`--label '<optional-compact-slot-prefix>${PLAN_SLUG}'`);
		expect(dryRun).not.toContain(`herdr launch-plan from ${SOURCE_BRANCH}`);
		expect(dryRun).toContain("herdr pane run");
		expect(dryRun).toContain(`/ns:branch-context:impl-attached-plan ${PLAN_KEY}`);
		expect(dryRun).not.toContain("herdr tab create");
	});
});

describe("ns:herdr:impl:plan:tab — dry-run (no Herdr mutations)", () => {
	test("executes from local trunk using the caller workspace captured before interaction", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway({
			callerPaneResult: resolvedCallerPane("caller-workspace-before-interaction"),
		});
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
			// The caller space is resolved exactly once, before idle waiting and
			// interaction; it is never re-queried afterwards.
			onWaitForIdle: () => expect(herdr.resolveCallerPaneCalls).toBe(1),
		});
		const git = new InMemoryGitGateway({ optionalRepoRoot: repoRoot });
		const brmem = new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const graphite = new InMemoryGraphiteBranchGateway();
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite,
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
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
		expect(herdr.resolveCallerPaneCalls).toBe(1);
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

	test("local-trunk dry-run previews the tab implementation without fetching or mutating", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				step("git", ["rev-parse", "--verify", `refs/heads/${TRUNK_BRANCH}`], {
					stdout: `${START_POINT}\n`,
				}),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			selectIndices: [1],
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const git = new InMemoryGitGateway({ optionalRepoRoot: repoRoot });
		const brmem = new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH });
		const graphite = new InMemoryGraphiteBranchGateway();
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = () => ({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: TEST_PROJECT_CONFIG,
			brmem,
			graphite,
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--dry-run",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
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
		expect(dryRun).toContain(`Tab label: ${PLAN_SLUG}`);
		expect(dryRun).toContain(
			`herdr tab create --workspace '<caller-workspace>' --focus --cwd '<slot-worktree-path>' --label ${PLAN_SLUG}`,
		);
	});

	test("dry-run requires a resolved caller space before repository or plan lookup", async () => {
		const pi = new FakePi({ script: [] });
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--dry-run",
			dependencies: dispatchPlanDependencies(),
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
				destination: "tab",
			},
			notifyProgress: () => {},
		});

		expect(pi.execCalls).toEqual([]);
		expect(ctx.waitCount).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("captures the exact caller ID and carries it to the created tab", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway({
			callerPaneResult: resolvedCallerPane("caller-workspace-exact"),
		});
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrPlanImplTestOptions(planStoreRoot);
		let contextConstructions = 0;
		options.createBranchContextContext = (_commands, _cwd) => {
			contextConstructions += 1;
			return {
				commands: createHerdrPiCommandApi(pi),
				git: new InMemoryGitGateway({
					optionalRepoRoot: repoRoot,
					currentBranch: SOURCE_BRANCH,
					headCommit: START_POINT,
					existingBranches: [PLAN_SLUG],
				}),
				projectConfig: TEST_PROJECT_CONFIG,
				brmem: new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
				graphite: new InMemoryGraphiteBranchGateway(),
			};
		};

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
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

	test("space implementation branch-context failure names the unopened Herdr space", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = (_commands, _cwd) => ({
			commands: createHerdrPiCommandApi(pi),
			git: new InMemoryGitGateway({
				optionalRepoRoot: repoRoot,
				currentBranch: SOURCE_BRANCH,
				headCommit: START_POINT,
			}),
			projectConfig: TEST_PROJECT_CONFIG,
			brmem: new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
			graphite: new InMemoryGraphiteBranchGateway({
				trackFailure: { code: "track_failed", message: "Graphite refused tracking." },
			}),
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:space",
				statusKey: "ns:herdr:impl:plan:space",
				destination: "workspace",
			},
			notifyProgress: () => {},
		});

		pi.assertDone();
		const failure = notificationMessages(ctx).join("\n---\n");
		expect(failure).toContain("Failed to create branch context and attach plan.");
		expect(failure).toMatch(/Source file: [^\n]+\nNo Herdr space was opened\.\n\n/);
		expect(failure).toContain("Graphite refused tracking.");
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("tab implementation branch-context failure names the unopened Herdr tab", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, { content: PLAN_CONTENT });
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});
		const options = herdrPlanImplTestOptions(planStoreRoot);
		options.createBranchContextContext = (_commands, _cwd) => ({
			commands: createHerdrPiCommandApi(pi),
			git: new InMemoryGitGateway({
				optionalRepoRoot: repoRoot,
				currentBranch: SOURCE_BRANCH,
				headCommit: START_POINT,
			}),
			projectConfig: TEST_PROJECT_CONFIG,
			brmem: new TrackingBranchMemoryGateway({ currentBranch: SOURCE_BRANCH }),
			graphite: new InMemoryGraphiteBranchGateway({
				trackFailure: { code: "track_failed", message: "Graphite refused tracking." },
			}),
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "",
			dependencies: options,
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
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

	test("resolved-caller dry-run shows tab preview without creating tab or pane", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writePlanStoreFile(planStoreRoot, repoRoot, {
			content: PLAN_CONTENT,
		});
		const pi = new FakePi({
			script: [
				...implValidationScript(repoRoot),
				focusedModelStep(PLAN_CONTENT, "branch-context-plan", { stdout: `${PLAN_SLUG}\n` }),
				headStep(),
			],
		});
		const herdr = new FakeHerdrGateway();
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile)],
		});

		await handleHerdrSlotImplPlan(herdrPlanTestContext({ pi, ctx, herdr }), {
			rawArgs: "--dry-run",
			dependencies: herdrPlanImplTestOptions(planStoreRoot),
			config: {
				commandName: "ns:herdr:impl:plan:tab",
				statusKey: "ns:herdr:impl:plan:tab",
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
		expect(dryRun).toContain(`Tab label: ${PLAN_SLUG}`);
		expect(dryRun).toContain(`--label ${PLAN_SLUG}`);
		expect(dryRun).toContain("herdr pane run");
		expect(dryRun).toContain(`/ns:branch-context:impl-attached-plan ${PLAN_KEY}`);
		expect(dryRun).not.toContain("herdr workspace create");
	});
});
