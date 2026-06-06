import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { registerCmuxSlotDispatchPromptCommand } from "../src/cmux/dispatch-prompt.ts";
import registerCmuxExtension from "../src/cmux.ts";
import { buildRepoPlanStoreKey, encodeBranchForPlanPath, normalizeRepoOriginUrl } from "@asdl/planned-branch";
import { registerCmuxSlotDispatchPlanCommand } from "../src/cmux/slot-dispatch-plan.ts";
import {
	formatObjectiveSidebarFields,
	resolveObjectiveSelector,
} from "../src/cmux/objective-sidebar.ts";
import { registerCmuxSlotOpenBranchCommand } from "../src/cmux/slot-open-branch.ts";
import { createCmuxSidebarController, registerCmuxSidebarCommands } from "../src/cmux/sidebar.ts";
import type {
	AgentEndContext,
	AutocompleteProvider,
	CommandContext,
	CommandDefinition,
	ExecOptions,
	ExecResult,
	ExtensionAPI,
	ModelInfo,
	NotifyLevel,
	SessionStartContext,
	ThinkingLevel,
} from "../src/cmux/types.ts";
import type { SkillCommandInfo } from "../src/skill-expansion.ts";

const ROOT = "/repo";
const WORKTREE = "/slot/worktree";
const BRANCH = "cmux-summary-hooks";
const PLAN_SLUG = "cmux-summary-hooks";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const SOURCE_BRANCH = "source-branch";
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const FAST_MODEL: ModelInfo = { provider: "openai-codex", id: "gpt-5.4-mini" };
const PREVIOUS_MODEL: ModelInfo = { provider: "anthropic", id: "claude-sonnet-4-5" };

type EventName = "agent_end" | "session_start";
type AgentEndHandler = (_event: unknown, ctx: AgentEndContext) => Promise<void> | void;
type SessionStartHandler = (_event: unknown, ctx: SessionStartContext) => Promise<void> | void;

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

interface ScriptedExec {
	command: string;
	args?: string[];
	result: Partial<ExecResult>;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface Selection {
	title: string;
	items: string[];
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, CommandDefinition>();
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	readonly sentMessages: Array<{ customType: string; content: string | Array<{ type: "text"; text: string }>; display: boolean; details?: unknown }> = [];
	readonly setModels: ModelInfo[] = [];
	readonly thinkingLevels: string[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly skillCommands: SkillCommandInfo[];
	private readonly eventHandlers: Record<EventName, Array<AgentEndHandler | SessionStartHandler>> = {
		agent_end: [],
		session_start: [],
	};
	private thinkingLevel: ThinkingLevel = "medium";

	constructor(options: { script?: ScriptedExec[]; skillCommands?: SkillCommandInfo[] } = {}) {
		this.script = [...(options.script ?? [])];
		this.skillCommands = [...(options.skillCommands ?? [])];
	}

	on(event: "agent_end", handler: AgentEndHandler): void;
	on(event: "session_start", handler: SessionStartHandler): void;
	on(event: EventName, handler: AgentEndHandler | SessionStartHandler): void {
		this.eventHandlers[event].push(handler);
	}

	registerCommand(name: string, options: CommandDefinition): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || (expected.args !== undefined && !sameArgs(expected.args, args))) {
			const expectedArgs = expected.args === undefined ? "<unspecified>" : expected.args.join(" ");
			const message = `expected ${expected.command} ${expectedArgs}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	getCommands(): readonly SkillCommandInfo[] {
		return this.skillCommands;
	}

	getThinkingLevel(): ThinkingLevel {
		return this.thinkingLevel;
	}

	setThinkingLevel(level: ThinkingLevel): void {
		this.thinkingLevel = level;
		this.thinkingLevels.push(level);
	}

	async setModel(model: ModelInfo): Promise<boolean> {
		this.setModels.push(model);
		return model.id !== "unavailable";
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	sendMessage(message: { customType: string; content: string | Array<{ type: "text"; text: string }>; display: boolean; details?: unknown }): void {
		this.sentMessages.push(message);
	}

	async emitAgentEnd(ctx: AgentEndContext): Promise<void> {
		for (const handler of this.eventHandlers.agent_end) {
			await (handler as AgentEndHandler)({}, ctx);
		}
	}

	async emitSessionStart(ctx: SessionStartContext): Promise<void> {
		for (const handler of this.eventHandlers.session_start) {
			await (handler as SessionStartHandler)({}, ctx);
		}
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

class FakeCommandContext implements CommandContext {
	readonly cwd: string;
	readonly hasUI = true;
	readonly notifications: Notification[] = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly selections: Selection[] = [];
	readonly autocompleteProviders: Array<(current: AutocompleteProvider) => AutocompleteProvider> = [];
	readonly ui: CommandContext["ui"];
	readonly modelRegistry: CommandContext["modelRegistry"];
	readonly sessionManager: NonNullable<CommandContext["sessionManager"]>;
	model?: ModelInfo;
	waitCount = 0;
	shouldConfirm = true;
	cancelSelect = false;
	private readonly selectIndices: number[];

	constructor(options: { cwd?: string; model?: ModelInfo; fastModel?: ModelInfo; branchEntries?: unknown[]; selectIndices?: number[]; cancelSelect?: boolean } = {}) {
		this.cwd = options.cwd ?? ROOT;
		if (options.model !== undefined) {
			this.model = options.model;
		}
		this.selectIndices = [...(options.selectIndices ?? [0])];
		this.cancelSelect = options.cancelSelect ?? false;
		this.modelRegistry = {
			find: (provider, modelId) => {
				const fastModel = options.fastModel;
				if (fastModel !== undefined && fastModel.provider === provider && fastModel.id === modelId) {
					return fastModel;
				}
				return undefined;
			},
		};
		const entries = [...(options.branchEntries ?? [])];
		this.sessionManager = {
			getBranch: () => entries,
			getEntries: () => entries,
		};
		this.ui = {
			notify: (message, level) => {
				this.notifications.push({ message, level });
			},
			setStatus: (key, value) => {
				this.statuses.push({ key, value });
			},
			confirm: async () => this.shouldConfirm,
			select: async (title, items) => {
				this.selections.push({ title, items: [...items] });
				if (this.cancelSelect) {
					return undefined;
				}
				const index = this.selectIndices.shift() ?? 0;
				return items[index];
			},
			addAutocompleteProvider: (factory) => {
				this.autocompleteProviders.push(factory);
			},
		};
	}

	async waitForIdle(): Promise<void> {
		this.waitCount += 1;
	}
}

const tempDirs: string[] = [];
const originalCmuxWorkspaceId = process.env.CMUX_WORKSPACE_ID;
const originalCmuxTabId = process.env.CMUX_TAB_ID;
const originalSidebarModel = process.env.ASDL_CMUX_SIDEBAR_MODEL;

afterEach(async () => {
	process.env.CMUX_WORKSPACE_ID = originalCmuxWorkspaceId;
	process.env.CMUX_TAB_ID = originalCmuxTabId;
	process.env.ASDL_CMUX_SIDEBAR_MODEL = originalSidebarModel;
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("cmux extension", () => {
	test("registers the project cmux command suite", () => {
		const pi = new FakePi();

		registerCmuxExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"cmux:sidebar:objective-summary",
			"cmux:sidebar:pr-summary",
			"cmux:workspace:dispatch-plan",
			"cmux:workspace:dispatch-prompt",
			"cmux:workspace:open-branch",
		]);
	});

	test("cmux:sidebar:pr-summary queues expanded skill prompt and restores the previous model", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const skillPath = await writeTempSkill("Use direct `--description` command shape.");
		const pi = new FakePi({ skillCommands: [skillCommand("cmux-sidebar", skillPath)] });
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL, fastModel: FAST_MODEL });

		await pi.commands.get("cmux:sidebar:pr-summary")?.handler("", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("<skill name=\"cmux-sidebar\"");
		expect(pi.sentUserMessages[0]).toContain("Requested variant: PR sidebar.");
		expect(pi.sentUserMessages[0]).toContain("--description");
		expect(pi.setModels).toEqual([FAST_MODEL]);
		expect(pi.thinkingLevels).toEqual(["minimal"]);
		expect(ctx.statuses).toEqual([
			{ key: "pi:cmux-sidebar", value: "preparing cmux sidebar…" },
			{ key: "pi:cmux-sidebar", value: undefined },
		]);

		await pi.emitAgentEnd(ctx);

		expect(pi.setModels).toEqual([FAST_MODEL, PREVIOUS_MODEL]);
		expect(pi.thinkingLevels).toEqual(["minimal", "medium"]);
	});

	test("cmux:sidebar:objective-summary applies deterministic Objective sidebar from explicit slug", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		await writeObjectiveMarkdown(repoRoot, slug, "# cmux Extension Consolidation\n\n## Thesis\nDo not summarize this body.\n");
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveReadStep(slug, { updateCount: 2 }),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "objective",
				args: ["exec", "read-objective", slug, "--format", "json"],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
			{
				command: "git",
				args: ["branch", "--show-current"],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
			{
				command: "asdl",
				args: [
					"exec",
					"cmux-workspace-summary",
					"--title",
					expectedTitle,
					"--description",
					expectedDescription,
					"--format",
					"json",
				],
				options: { cwd: repoRoot, timeout: 30_000 },
			},
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(ctx.statuses).toEqual([
			{ key: "pi:cmux-sidebar", value: "preparing cmux Objective sidebar…" },
			{ key: "pi:cmux-sidebar", value: undefined },
		]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("cmux:sidebar:objective-summary resolves Objective path selector to slug", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		await writeObjectiveMarkdown(repoRoot, slug, "# cmux Extension Consolidation\n");
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [objectiveReadStep(slug), gitCurrentBranchStep(), cmuxSummaryStep(expectedTitle, expectedDescription)],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(`.asdl/objectives/${slug}/objective.md`, ctx);

		pi.assertDone();
		expect(pi.execCalls[0]).toMatchObject({ command: "objective", args: ["exec", "read-objective", slug, "--format", "json"] });
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("cmux:sidebar:objective-summary without selector opens Objective picker and applies selection", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "bravo-objective";
		await writeObjectiveMarkdown(repoRoot, slug, "# Bravo Objective\n");
		const expectedTitle = `obj:${slug}`;
		const expectedDescription = objectiveSidebarDescription(repoRoot);
		const pi = new FakePi({
			script: [
				objectiveListStep(["alpha-objective", slug]),
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				cmuxSummaryStep(expectedTitle, expectedDescription),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot, selectIndices: [1] });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(ctx.selections).toEqual([
			{
				title: "Select an active Objective for cmux sidebar",
				items: [
					"alpha-objective — open — latest update 2026-01-01T00:00:00Z",
					"bravo-objective — open — latest update 2026-01-02T00:00:00Z",
				],
			},
		]);
		expect(pi.execCalls.map((call) => [call.command, call.args])).toEqual([
			["objective", ["list", "--format", "json"]],
			["objective", ["exec", "read-objective", slug, "--format", "json"]],
			["git", ["branch", "--show-current"]],
			["asdl", ["exec", "cmux-workspace-summary", "--title", expectedTitle, "--description", expectedDescription, "--format", "json"]],
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Applied cmux Objective sidebar: ${expectedTitle}`);
	});

	test("cmux:sidebar:objective-summary picker cancellation stops without model or apply", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi({ script: [objectiveListStep(["alpha-objective"])] });
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cancelSelect: true });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({ message: "Objective selection cancelled.", level: "info" });
	});

	test("cmux:sidebar:objective-summary with no active Objectives stops without model or apply", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi({ script: [objectiveListStep([])] });
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("", ctx);

		pi.assertDone();
		expect(ctx.selections).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" });
	});

	test("cmux:sidebar:objective-summary missing workspace skips deterministic work", async () => {
		delete process.env.CMUX_WORKSPACE_ID;
		delete process.env.CMUX_TAB_ID;
		const pi = new FakePi();
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler("cmux-objective", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Not running inside a cmux caller workspace.");
	});

	test("cmux:sidebar:objective-summary surfaces Objective read failure without applying cmux", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const slug = "ghost-objective";
		const pi = new FakePi({
			script: [
				step("objective", ["exec", "read-objective", slug, "--format", "json"], {
					code: 1,
					stdout: JSON.stringify({ exit_code: 1, message: "Objective not found", data: { status: "not_found" } }),
				}),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Objective not found");
	});

	test("cmux:sidebar:objective-summary surfaces cmux apply failure", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const repoRoot = await makeTempDir();
		const slug = "cmux-extension-consolidation";
		await writeObjectiveMarkdown(repoRoot, slug, "# cmux Extension Consolidation\n");
		const pi = new FakePi({
			script: [
				objectiveReadStep(slug),
				gitCurrentBranchStep(),
				step("asdl", [
					"exec",
					"cmux-workspace-summary",
					"--title",
					`obj:${slug}`,
					"--description",
					objectiveSidebarDescription(repoRoot),
					"--format",
					"json",
				], {
					code: 1,
					stdout: JSON.stringify({ exit_code: 1, message: "missing workspace", data: { success: false } }),
				}),
			],
		});
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ cwd: repoRoot });

		await pi.commands.get("cmux:sidebar:objective-summary")?.handler(slug, ctx);

		pi.assertDone();
		expect(pi.execCalls).toHaveLength(3);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("missing workspace");
	});

	test("sidebar fallback uses one-line Goal description and missing workspace skips send", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi();
		const controller = createCmuxSidebarController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:sidebar:pr-summary")?.handler("", ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("--description 'Goal: ...'");
		expect(pi.sentUserMessages[0]).not.toContain("State: ...");
		expect(pi.sentUserMessages[0]).not.toContain("--goal");
		expect(pi.sentUserMessages[0]).not.toContain("--status");

		delete process.env.CMUX_WORKSPACE_ID;
		delete process.env.CMUX_TAB_ID;
		const noWorkspace = new FakeCommandContext();
		await pi.commands.get("cmux:sidebar:pr-summary")?.handler("", noWorkspace);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(noWorkspace.notifications.at(-1)?.message).toBe("Not running inside a cmux caller workspace.");
	});

	test("cmux:workspace:open-branch opens explicit branch without queuing sidebar summary", async () => {
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
		registerCmuxSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:workspace:open-branch")?.handler(BRANCH, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Opened cmux workspace for branch: ${BRANCH}`);
	});

	test("cmux:workspace:open-branch cancels inferred branch without opening workspace", async () => {
		const pi = new FakePi();
		registerCmuxSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext({ branchEntries: [plannedBranchOutputEntry("feature/latest")] });
		ctx.shouldConfirm = false;

		await pi.commands.get("cmux:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Cancelled; no cmux workspace was opened.");
	});

	test("cmux:workspace:open-branch does not infer from text-only planned branch output", async () => {
		const pi = new FakePi();
		registerCmuxSlotOpenBranchCommand(pi);
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

		await pi.commands.get("cmux:workspace:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("No latest [planned-branch-output] branch found");
	});

	test("cmux:workspace:dispatch-plan dry-run emits preview without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				headStep(),
			],
		});
		registerCmuxSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({ cwd: repoRoot, branchEntries: [savedPlanEntry(repoRoot, planFile)] });

		await pi.commands.get("cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "dry-run", targetBranch: PLAN_SLUG, key: PLAN_KEY });
		const content = String(pi.sentMessages[0]?.content);
		expect(content).toContain("Dry run: no branch was created, no plan was attached, and no cmux workspace was opened.");
		expect(content).toContain(`Path: ${planFile}`);
		expect(content).toContain(`Slug: ${PLAN_SLUG}`);
		expect(content).toContain(`Source branch: ${SOURCE_BRANCH}`);
		expect(content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(content).toContain("slot checkout");
		expect(content).toContain("cmux new-workspace");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
	});

	test("cmux:workspace:dispatch-plan full success opens cmux without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const realPlanFile = await realpath(planFile);
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				gitOriginStep(),
				gitRootStep(repoRoot),
				step("git", ["check-ref-format", "--branch", PLAN_SLUG], {}),
				headStep(),
				step("git", ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`], missingRevisionResult()),
				step("brmem", ["check", PLAN_KEY, "--namespace", "planned-branch", "--branch", PLAN_SLUG, "--format", "json"], { code: 1 }),
				gitCurrentBranchStep(),
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
		registerCmuxSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({ cwd: repoRoot, model: PREVIOUS_MODEL, branchEntries: [savedPlanEntry(repoRoot, planFile)] });

		await pi.commands.get("cmux:workspace:dispatch-plan")?.handler("", ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "success" });
		expect(notificationMessages(ctx).some((message) => message.includes("Dispatched plan in cmux workspace."))).toBe(true);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("cmux:workspace:dispatch-plan rejects session plan outside local plan store", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const outsidePlanFile = join(outsideDir, PLAN_KEY);
		await writeFile(outsidePlanFile, "# Outside Plan\n", "utf8");
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCmuxSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({ cwd: repoRoot, branchEntries: [savedPlanEntry(repoRoot, outsidePlanFile)] });

		await pi.commands.get("cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("outside the current local plan store directory");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("cmux:workspace:dispatch-plan rejects wrong repo metadata", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCmuxSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { repoKey: "gh--other--repo" })],
		});

		await pi.commands.get("cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("repoKey");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("cmux:workspace:dispatch-plan rejects wrong source branch or branch key", async () => {
		const repoRoot = await makeTempDir();
		const planStoreRoot = await makeTempDir();
		const planFile = await writeCmuxPlanStoreFile(planStoreRoot, repoRoot);
		const pi = new FakePi({ script: dispatchValidationScript(repoRoot) });
		registerCmuxSlotDispatchPlanCommand(pi, { planStoreRoot });
		const ctx = new FakeCommandContext({
			cwd: repoRoot,
			branchEntries: [savedPlanEntry(repoRoot, planFile, { sourceBranch: "other-branch", branchKey: "other-branch" })],
		});

		await pi.commands.get("cmux:workspace:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(notificationMessages(ctx).join("\n")).toContain("sourceBranch");
		expect(notificationMessages(ctx).join("\n")).toContain("branchKey");
		expect(pi.execCalls.some(isDispatchMutationCommand)).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("cmux:workspace:dispatch-prompt opens cmux without sidebar summary", async () => {
		const promptDir = await makeTempDir();
		const pi = new FakePi({
			script: [
				step("git", ["symbolic-ref", "--short", "HEAD"], { stdout: `${SOURCE_BRANCH}\n` }),
				step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` }),
				step("pi", undefined, { stdout: `${BRANCH}\n` }),
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
		registerCmuxSlotDispatchPromptCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("cmux:workspace:dispatch-prompt")?.handler("Implement the cmux dispatch flow", ctx);

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

describe("cmux Objective sidebar deterministic helpers", () => {
	test("resolveObjectiveSelector accepts slugs and active Objective paths", () => {
		const cwd = "/repo";

		expect(resolveObjectiveSelector("cmux-objective", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
		expect(resolveObjectiveSelector(".asdl/objectives/cmux-objective/objective.md", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
		expect(resolveObjectiveSelector(".asdl/objectives/cmux-objective", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
		expect(resolveObjectiveSelector("/repo/.asdl/objectives/cmux-objective/roadmap.md", cwd)).toEqual({ type: "valid", slug: "cmux-objective" });
	});

	test("resolveObjectiveSelector rejects ambiguous or inactive selectors", () => {
		const cwd = "/repo";
		for (const selector of ["foo/bar", ".", "..", ".asdl/objective-archive/old/objective.md", "/tmp/outside/objective.md"]) {
			expect(resolveObjectiveSelector(selector, cwd).type).toBe("invalid");
		}
	});

	test("formatObjectiveSidebarFields uses Objective, slot, and branch slugs deterministically", () => {
		const fields = formatObjectiveSidebarFields({
			objectiveSlug: "make-cmux-sidebar-descriptions-deterministic",
			slotSlug: "slot-05",
			branchSlug: "deterministic-objective-sidebar-direct-extension",
		});

		expect(fields).toEqual({
			title: "obj:make-cmux-sidebar-descriptions-deterministic",
			description: "slot-05::deterministic-objective-sidebar-direct-extension",
		});
		expect(formatObjectiveSidebarFields({
			objectiveSlug: "make-cmux-sidebar-descriptions-deterministic",
			slotSlug: "slot-05",
			branchSlug: "deterministic-objective-sidebar-direct-extension",
		})).toEqual(fields);
	});
});

function notificationMessages(ctx: FakeCommandContext): string[] {
	return ctx.notifications.map((notification) => notification.message);
}

function objectiveSidebarDescription(repoRoot: string): string {
	return `${basename(repoRoot)}::${SOURCE_BRANCH}`;
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[] | undefined, result: Partial<ExecResult>): ScriptedExec {
	return { command, ...(args === undefined ? {} : { args }), result };
}

function objectiveListStep(slugs: string[]): ScriptedExec {
	return step("objective", ["list", "--format", "json"], {
		stdout: JSON.stringify({
			exit_code: 0,
			data: {
				trunk_branch: "master",
				root_path: ".asdl/objectives",
				status_filter: "active",
				names_only: false,
				records: slugs.map((slug, index) => ({
					slug,
					status: "open",
					latest_update_iso: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
				})),
			},
		}),
	});
}

function objectiveReadStep(slug: string, options: { updateCount?: number; hasObjectiveMarkdown?: boolean } = {}): ScriptedExec {
	return step("objective", ["exec", "read-objective", slug, "--format", "json"], {
		stdout: JSON.stringify({
			exit_code: 0,
			data: {
				status: "ok",
				slug,
				path: `.asdl/objectives/${slug}`,
				exists: true,
				closed: false,
				files: {
					objective_md: options.hasObjectiveMarkdown ?? true,
					roadmap_md: true,
					updates_dir: true,
					closed_md: false,
				},
				updates: [],
				update_count: options.updateCount ?? 0,
			},
		}),
	});
}

function cmuxSummaryStep(title: string, description: string): ScriptedExec {
	return step("asdl", ["exec", "cmux-workspace-summary", "--title", title, "--description", description, "--format", "json"], {
		stdout: JSON.stringify({
			exit_code: 0,
			data: {
				success: true,
				title,
				description,
				status_key: "pi-summary",
			},
		}),
	});
}

function slotCheckoutJson(branch: string): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			slot_name: "slot-01",
			branch_name: branch,
			worktree_path: WORKTREE,
			already_assigned: false,
		},
	});
}

function brmemPutJson(repoRoot: string, planFile: string): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "planned-branch",
			key: PLAN_KEY,
			branch: PLAN_SLUG,
			ref_name: `refs/brmem/ns/planned-branch/${PLAN_SLUG}:${PLAN_KEY}`,
			commit: START_POINT,
			source_file: planFile,
			repo_root: repoRoot,
		},
	});
}

function missingRevisionResult(): Partial<ExecResult> {
	return { code: 128, stderr: "fatal: Needed a single revision\n" };
}

function gitRootStep(repoRoot: string): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${repoRoot}\n` });
}

function gitCurrentBranchStep(): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${SOURCE_BRANCH}\n` });
}

function gitOriginStep(): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], { stdout: "git@github.com:owner/repo.git\n" });
}

function headStep(): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` });
}

async function makeTempDir(): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "cmux-extension-test-")));
	tempDirs.push(dir);
	return dir;
}

async function writeTempSkill(body: string): Promise<string> {
	const dir = await makeTempDir();
	const path = join(dir, "SKILL.md");
	await writeFile(path, `---\nname: cmux-sidebar\n---\n${body}\n`, "utf8");
	return path;
}

async function writeObjectiveMarkdown(repoRoot: string, slug: string, markdown: string): Promise<void> {
	const objectiveDir = join(repoRoot, ".asdl", "objectives", slug);
	await mkdir(objectiveDir, { recursive: true });
	await writeFile(join(objectiveDir, "objective.md"), markdown, "utf8");
}

async function writeCmuxPlanStoreFile(planStoreRoot: string, repoRoot: string): Promise<string> {
	const directoryPath = cmuxPlanStoreDirectory(planStoreRoot, repoRoot);
	await mkdir(directoryPath, { recursive: true });
	const planFile = join(directoryPath, PLAN_KEY);
	await writeFile(planFile, "# Plan\n", "utf8");
	return planFile;
}

function cmuxPlanStoreDirectory(planStoreRoot: string, repoRoot: string): string {
	const repoKey = buildRepoPlanStoreKey(repoRoot, normalizeRepoOriginUrl("git@github.com:owner/repo.git"));
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	return join(planStoreRoot, repoKey, branchKey);
}

function dispatchValidationScript(repoRoot: string): ScriptedExec[] {
	return [gitRootStep(repoRoot), gitCurrentBranchStep(), gitOriginStep()];
}

function isDispatchMutationCommand(call: ExecCall): boolean {
	return (call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current") || call.command === "gt" || call.command === "brmem" || call.command === "slot" || call.command === "cmux";
}

function skillCommand(skillName: string, path: string): SkillCommandInfo {
	return {
		name: `skill:${skillName}`,
		source: "skill",
		sourceInfo: { path },
	};
}

function plannedBranchOutputEntry(branch: string): unknown {
	return {
		message: {
			customType: "planned-branch-output",
			content: "Created planned branch and attached plan.",
			details: {
				status: "success",
				evidence: {
					slug: branch,
					branch,
					branchCreation: "graphite",
					startPoint: START_POINT,
					namespace: "planned-branch",
					key: `${branch}.md`,
					refName: `refs/brmem/ns/planned-branch/${branch}:${branch}.md`,
					commit: START_POINT,
					sourceFile: `/plans/${branch}.md`,
				},
			},
		},
	};
}

function savedPlanEntry(repoRoot: string, planFile: string, overrides: Record<string, unknown> = {}): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "write_source_branch_plan_file",
			isError: false,
			details: {
				slug: PLAN_SLUG,
				repoRoot,
				repoKey: buildRepoPlanStoreKey(repoRoot, normalizeRepoOriginUrl("git@github.com:owner/repo.git")),
				repoIdentitySource: "origin-url",
				sourceBranch: SOURCE_BRANCH,
				branchKey: encodeBranchForPlanPath(SOURCE_BRANCH),
				filePath: planFile,
				summary: "Test saved plan.",
				...overrides,
			},
		},
	};
}
