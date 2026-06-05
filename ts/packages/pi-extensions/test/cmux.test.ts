import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerCmuxDispatchCommand } from "../src/cmux/dispatch.ts";
import registerCmuxExtension from "../src/cmux.ts";
import { registerCmuxSlotDispatchPlanCommand } from "../src/cmux/slot-dispatch-plan.ts";
import { registerCmuxSlotOpenBranchCommand } from "../src/cmux/slot-open-branch.ts";
import { createCmuxWorkspaceSummaryController, registerCmuxSidebarCommands } from "../src/cmux/workspace-summary.ts";
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
	readonly autocompleteProviders: Array<(current: AutocompleteProvider) => AutocompleteProvider> = [];
	readonly ui: CommandContext["ui"];
	readonly modelRegistry: CommandContext["modelRegistry"];
	readonly sessionManager: NonNullable<CommandContext["sessionManager"]>;
	model?: ModelInfo;
	waitCount = 0;
	shouldConfirm = true;

	constructor(options: { cwd?: string; model?: ModelInfo; fastModel?: ModelInfo; branchEntries?: unknown[] } = {}) {
		this.cwd = options.cwd ?? ROOT;
		if (options.model !== undefined) {
			this.model = options.model;
		}
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
const originalSummaryModel = process.env.ASDL_CMUX_SUMMARY_MODEL;

afterEach(async () => {
	process.env.CMUX_WORKSPACE_ID = originalCmuxWorkspaceId;
	process.env.CMUX_TAB_ID = originalCmuxTabId;
	process.env.ASDL_CMUX_SUMMARY_MODEL = originalSummaryModel;
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("cmux extension", () => {
	test("registers the project cmux command suite", () => {
		const pi = new FakePi();

		registerCmuxExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"cmux-dispatch",
			"cmux-slot:dispatch-plan",
			"cmux-slot:open-branch",
			"cmux:objective-sidebar",
			"cmux:pr-sidebar",
		]);
	});

	test("cmux:pr-sidebar queues expanded skill prompt and restores the previous model", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const skillPath = await writeTempSkill("Use direct `--description` command shape.");
		const pi = new FakePi({ skillCommands: [skillCommand("cmux-sidebar", skillPath)] });
		const controller = createCmuxWorkspaceSummaryController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL, fastModel: FAST_MODEL });

		await pi.commands.get("cmux:pr-sidebar")?.handler("", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("<skill name=\"cmux-sidebar\"");
		expect(pi.sentUserMessages[0]).toContain("Requested variant: PR sidebar.");
		expect(pi.sentUserMessages[0]).toContain("--description");
		expect(pi.setModels).toEqual([FAST_MODEL]);
		expect(pi.thinkingLevels).toEqual(["minimal"]);

		await pi.emitAgentEnd(ctx);

		expect(pi.setModels).toEqual([FAST_MODEL, PREVIOUS_MODEL]);
		expect(pi.thinkingLevels).toEqual(["minimal", "medium"]);
	});

	test("cmux:objective-sidebar includes supplied Objective selector", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const skillPath = await writeTempSkill("Use Objective sidebar variant.");
		const pi = new FakePi({ skillCommands: [skillCommand("cmux-sidebar", skillPath)] });
		const controller = createCmuxWorkspaceSummaryController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:objective-sidebar")?.handler("cmux-objective", ctx);

		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("Requested variant: Objective sidebar.");
		expect(pi.sentUserMessages[0]).toContain("Objective selector from command args: cmux-objective");
		expect(pi.sentUserMessages[0]).toContain("Summarize that asdl Objective, not the current PR.");
	});

	test("sidebar fallback uses one-line Goal description and missing workspace skips send", async () => {
		process.env.CMUX_WORKSPACE_ID = "workspace:caller";
		const pi = new FakePi();
		const controller = createCmuxWorkspaceSummaryController(pi);
		registerCmuxSidebarCommands(pi, controller);
		const ctx = new FakeCommandContext();

		await pi.commands.get("cmux:pr-sidebar")?.handler("", ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("--description 'Goal: ...'");
		expect(pi.sentUserMessages[0]).not.toContain("State: ...");
		expect(pi.sentUserMessages[0]).not.toContain("--goal");
		expect(pi.sentUserMessages[0]).not.toContain("--status");

		delete process.env.CMUX_WORKSPACE_ID;
		delete process.env.CMUX_TAB_ID;
		const noWorkspace = new FakeCommandContext();
		await pi.commands.get("cmux:pr-sidebar")?.handler("", noWorkspace);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(noWorkspace.notifications.at(-1)?.message).toBe("Not running inside a cmux caller workspace.");
	});

	test("cmux-slot:open-branch opens explicit branch without queuing sidebar summary", async () => {
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

		await pi.commands.get("cmux-slot:open-branch")?.handler(BRANCH, ctx);

		pi.assertDone();
		expect(ctx.waitCount).toBe(1);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
		expect(notificationMessages(ctx)).toContain(`Opened branch in CMUX slot: ${BRANCH}`);
	});

	test("cmux-slot:open-branch cancels inferred branch without opening workspace", async () => {
		const pi = new FakePi();
		registerCmuxSlotOpenBranchCommand(pi);
		const ctx = new FakeCommandContext({ branchEntries: [plannedBranchOutputEntry("feature/latest")] });
		ctx.shouldConfirm = false;

		await pi.commands.get("cmux-slot:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toBe("Cancelled; no CMUX slot was opened.");
	});

	test("cmux-slot:open-branch does not infer from text-only planned branch output", async () => {
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

		await pi.commands.get("cmux-slot:open-branch")?.handler("", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("No latest [planned-branch-output] branch found");
	});

	test("cmux-slot:dispatch-plan dry-run emits preview without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planDir = await makeTempDir();
		const planFile = join(planDir, `${PLAN_SLUG}.md`);
		await writeFile(planFile, "# Plan\n", "utf8");
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				headStep(),
			],
		});
		registerCmuxSlotDispatchPlanCommand(pi);
		const ctx = new FakeCommandContext({ cwd: repoRoot, branchEntries: [savedPlanEntry(repoRoot, planFile)] });

		await pi.commands.get("cmux-slot:dispatch-plan")?.handler("--dry-run", ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "dry-run", targetBranch: PLAN_SLUG });
	});

	test("cmux-slot:dispatch-plan full success opens cmux without sidebar summary", async () => {
		const repoRoot = await makeTempDir();
		const planDir = await makeTempDir();
		const planFile = join(planDir, `${PLAN_SLUG}.md`);
		await writeFile(planFile, "# Plan\n", "utf8");
		const realPlanFile = await realpath(planFile);
		const pi = new FakePi({
			script: [
				gitRootStep(repoRoot),
				gitCurrentBranchStep(),
				headStep(),
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
		registerCmuxSlotDispatchPlanCommand(pi);
		const ctx = new FakeCommandContext({ cwd: repoRoot, model: PREVIOUS_MODEL, branchEntries: [savedPlanEntry(repoRoot, planFile)] });

		await pi.commands.get("cmux-slot:dispatch-plan")?.handler("", ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.details).toMatchObject({ status: "success" });
		expect(notificationMessages(ctx).some((message) => message.includes("Dispatched plan in CMUX slot."))).toBe(true);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.setModels).toEqual([]);
		expect(pi.thinkingLevels).toEqual([]);
	});

	test("cmux-dispatch opens cmux without sidebar summary", async () => {
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
		registerCmuxDispatchCommand(pi, { promptDir, now: () => 123 });
		const ctx = new FakeCommandContext({ model: PREVIOUS_MODEL });

		await pi.commands.get("cmux-dispatch")?.handler("Implement the cmux dispatch flow", ctx);

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

function notificationMessages(ctx: FakeCommandContext): string[] {
	return ctx.notifications.map((notification) => notification.message);
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

function headStep(): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` });
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "cmux-extension-test-"));
	tempDirs.push(dir);
	return dir;
}

async function writeTempSkill(body: string): Promise<string> {
	const dir = await makeTempDir();
	const path = join(dir, "SKILL.md");
	await writeFile(path, `---\nname: cmux-sidebar\n---\n${body}\n`, "utf8");
	return path;
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

function savedPlanEntry(repoRoot: string, planFile: string): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "write_source_branch_plan_file",
			isError: false,
			details: {
				slug: PLAN_SLUG,
				repoRoot,
				repoKey: "gh--owner--repo",
				repoIdentitySource: "origin-url",
				sourceBranch: SOURCE_BRANCH,
				branchKey: SOURCE_BRANCH,
				filePath: planFile,
				summary: "Test saved plan.",
			},
		},
	};
}
