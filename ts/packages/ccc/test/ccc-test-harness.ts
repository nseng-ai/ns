import { expect } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { buildRepoPlanStoreKey, encodeBranchForPlanPath, normalizeRepoOriginUrl } from "@asdl/plans";
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
import type { SkillCommandInfo } from "@asdl/pi-extension-runtime/skill-expansion";

export const ROOT = "/repo";
export const WORKTREE = "/slot/worktree";
export const BRANCH = "cmux-summary-hooks";
export const PLAN_SLUG = "cmux-summary-hooks";
export const PLAN_KEY = `${PLAN_SLUG}.md`;
export const SAVED_PLAN_FILENAME = `${PLAN_SLUG}.md`;
export const SOURCE_BRANCH = "source-branch";
export const START_POINT = "0123456789abcdef0123456789abcdef01234567";
export const FAST_MODEL: ModelInfo = { provider: "openai-codex", id: "gpt-5.4-mini" };
export const PREVIOUS_MODEL: ModelInfo = { provider: "anthropic", id: "claude-sonnet-4-5" };

type EventName = "agent_end" | "session_start";
type AgentEndHandler = (_event: unknown, ctx: AgentEndContext) => Promise<void> | void;
type SessionStartHandler = (_event: unknown, ctx: SessionStartContext) => Promise<void> | void;

export interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

export interface ScriptedExec {
	command: string;
	args?: string[];
	result?: Partial<ExecResult> | undefined;
	error?: unknown;
}

export interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

export interface Selection {
	title: string;
	items: string[];
}

export interface FakeCommandContextOptions {
	cwd?: string;
	model?: ModelInfo;
	fastModel?: ModelInfo;
	branchEntries?: unknown[];
	selectIndices?: number[];
	shouldCancelSelect?: boolean;
}

export class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, CommandDefinition>();
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	readonly sentMessages: Array<{ customType: string; content: string | Array<{ type: "text"; text: string }>; display: boolean; details?: unknown }> = [];
	readonly setModels: ModelInfo[] = [];
	readonly thinkingLevels: string[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly skillCommands: SkillCommandInfo[];
	private readonly shouldRequireExpectedArgs: boolean;
	private readonly eventHandlers: Record<EventName, Array<AgentEndHandler | SessionStartHandler>> = {
		agent_end: [],
		session_start: [],
	};
	private thinkingLevel: ThinkingLevel = "medium";

	constructor(options: { script?: ScriptedExec[]; skillCommands?: SkillCommandInfo[]; shouldRequireExpectedArgs?: boolean } = {}) {
		this.script = [...(options.script ?? [])];
		this.skillCommands = [...(options.skillCommands ?? [])];
		// Strict by default: undefined ScriptedExec args now count as a mismatch unless callers explicitly disable expected-arg checking.
		this.shouldRequireExpectedArgs = options.shouldRequireExpectedArgs ?? true;
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
		const { result, errorMessage } = runScriptedExec({
			expected,
			command,
			args,
			shouldRequireExpectedArgs: this.shouldRequireExpectedArgs,
		});
		if (errorMessage !== undefined) {
			this.errors.push(errorMessage);
		}
		return result;
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

export class FakeCommandContext implements CommandContext {
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
	shouldCancelSelect = false;
	private readonly selectIndices: number[];

	constructor(options: FakeCommandContextOptions = {}) {
		this.cwd = options.cwd ?? ROOT;
		if (options.model !== undefined) {
			this.model = options.model;
		}
		this.selectIndices = [...(options.selectIndices ?? [0])];
		this.shouldCancelSelect = options.shouldCancelSelect ?? false;
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
				if (this.shouldCancelSelect) {
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
const originalSidebarModel = process.env.ASDL_CCC_SIDEBAR_MODEL;

export async function resetCmuxTestEnvironment(): Promise<void> {
	restoreEnvValue("CMUX_WORKSPACE_ID", originalCmuxWorkspaceId);
	restoreEnvValue("CMUX_TAB_ID", originalCmuxTabId);
	restoreEnvValue("ASDL_CCC_SIDEBAR_MODEL", originalSidebarModel);
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
}

function restoreEnvValue(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}

export function notificationMessages(ctx: FakeCommandContext): string[] {
	return ctx.notifications.map((notification) => notification.message);
}

export function objectiveSidebarDescription(repoRoot: string): string {
	return `${basename(repoRoot)}::${SOURCE_BRANCH}`;
}

export function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export interface RunScriptedExecOptions {
	expected: ScriptedExec | undefined;
	command: string;
	args: string[];
	shouldRequireExpectedArgs?: boolean;
}

export interface RunScriptedExecResult {
	result: ExecResult;
	errorMessage?: string;
}

export function runScriptedExec(options: RunScriptedExecOptions): RunScriptedExecResult {
	const { expected, command, args, shouldRequireExpectedArgs = true } = options;
	if (!expected) {
		const message = `unexpected exec: ${command} ${args.join(" ")}`;
		return { result: execResult({ code: 99, stderr: message }), errorMessage: message };
	}

	if (expected.command !== command || expectedArgsMismatch(expected.args, args, shouldRequireExpectedArgs)) {
		const expectedArgs = expected.args === undefined ? "<unspecified>" : expected.args.join(" ");
		const message = `expected ${expected.command} ${expectedArgs}, got ${command} ${args.join(" ")}`;
		return { result: execResult({ code: 99, stderr: message }), errorMessage: message };
	}

	if (expected.error) {
		throw expected.error;
	}

	return { result: execResult(expected.result) };
}

function expectedArgsMismatch(expectedArgs: string[] | undefined, actualArgs: string[], shouldRequireExpectedArgs: boolean): boolean {
	if (expectedArgs === undefined) {
		return shouldRequireExpectedArgs;
	}

	return !sameArgs(expectedArgs, actualArgs);
}

export function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

export function step(command: string, args: string[] | undefined, result?: Partial<ExecResult>): ScriptedExec {
	return { command, ...(args === undefined ? {} : { args }), result };
}

export function objectiveListStep(slugs: string[]): ScriptedExec {
	return step("objective", ["list", "--minimal", "--format", "json"], {
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

export function objectiveReadStep(slug: string): ScriptedExec {
	return step("objective", ["exec", "read-objective", slug, "--format", "json"], {
		stdout: JSON.stringify({
			exit_code: 0,
			data: {
				status: "ok",
				slug,
			},
		}),
	});
}

export function cmuxSummaryStep(title: string, description: string): ScriptedExec {
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

export function slotCheckoutJson(branch: string): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			slot_name: "slot-01",
			branch_name: branch,
			worktree_path: WORKTREE,
			cd_command: `cd ${WORKTREE}`,
			already_assigned: false,
		},
	});
}

export function brmemPutJson(repoRoot: string, planFile: string): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "branch-context",
			key: PLAN_KEY,
			branch: PLAN_SLUG,
			ref_name: `refs/brmem/ns/branch-context/${PLAN_SLUG}:${PLAN_KEY}`,
			commit: START_POINT,
			source_file: planFile,
			repo_root: repoRoot,
		},
	});
}

export function missingRevisionResult(): Partial<ExecResult> {
	return { code: 128, stderr: "fatal: Needed a single revision\n" };
}

export function gitRootStep(repoRoot: string): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${repoRoot}\n` });
}

export function gitCurrentBranchStep(): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${SOURCE_BRANCH}\n` });
}

export function gitOriginStep(): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], { stdout: "git@github.com:owner/repo.git\n" });
}

export function headStep(): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` });
}

export async function makeTempDir(): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "cmux-extension-test-")));
	tempDirs.push(dir);
	return dir;
}

export async function writeSelfContainedSkillMarkdown(content: string): Promise<string> {
	const dir = await makeTempDir();
	const path = join(dir, "SKILL.md");
	await writeFile(path, content, "utf8");
	return path;
}

export async function writeTempSkillMarkdown(skillName: string, body: string): Promise<string> {
	return writeSelfContainedSkillMarkdown(`---\nname: ${skillName}\n---\n${body}\n`);
}

export async function writeTempSkill(body: string): Promise<string> {
	return writeTempSkillMarkdown("ccc-sidebar", body);
}

export async function writeCmuxPlanStoreFile(planStoreRoot: string, repoRoot: string, options: { fileName?: string; content?: string } = {}): Promise<string> {
	const directoryPath = cmuxPlanStoreDirectory(planStoreRoot, repoRoot);
	await mkdir(directoryPath, { recursive: true });
	const planFile = join(directoryPath, options.fileName ?? SAVED_PLAN_FILENAME);
	await writeFile(planFile, options.content ?? "# Plan\n", "utf8");
	return planFile;
}

export function cmuxPlanStoreDirectory(planStoreRoot: string, repoRoot: string): string {
	const repoKey = buildRepoPlanStoreKey(repoRoot, normalizeRepoOriginUrl("git@github.com:owner/repo.git"));
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	return join(planStoreRoot, repoKey, branchKey);
}

export function dispatchValidationScript(repoRoot: string): ScriptedExec[] {
	return [gitRootStep(repoRoot), gitCurrentBranchStep(), gitOriginStep()];
}

export function isDispatchMutationCommand(call: ExecCall): boolean {
	return (call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current") || call.command === "gt" || call.command === "brmem" || call.command === "slot" || call.command === "cmux";
}

export function skillCommand(skillName: string, path: string): SkillCommandInfo {
	return {
		name: `skill:${skillName}`,
		source: "skill",
		sourceInfo: { path },
	};
}

export function branchContextOutputEntry(branch: string): unknown {
	const slug = branch.split("/").filter((segment) => segment.length > 0).at(-1) ?? branch;
	const key = PLAN_KEY;
	const encodedBranch = branch.replaceAll("/", "---");
	return {
		message: {
			customType: "branch-context-output",
			content: "Created branch context and attached plan.",
			details: {
				status: "success",
				evidence: {
					slug,
					branch,
					branchCreation: "graphite",
					startPoint: START_POINT,
					namespace: "branch-context",
					key,
					refName: `refs/brmem/ns/branch-context/${encodedBranch}:${key}`,
					commit: START_POINT,
					sourceFile: `/plans/${key}`,
				},
			},
		},
	};
}

export function savedPlanEntry(repoRoot: string, planFile: string, overrides: Record<string, unknown> = {}): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "write_saved_plan_file",
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
