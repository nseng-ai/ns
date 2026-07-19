import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	normalizeRepoOriginUrl,
} from "@nseng-ai/plans/api";

import type {
	AutocompleteProvider,
	CommandContext,
	CommandDefinition,
	ExtensionAPI,
	ModelInfo,
	NotifyLevel,
	RawPiExecOptions,
	RawPiExecResult,
	ThinkingLevel,
} from "@nseng-ai/capability-kit/pi-types";
import { parseMachineEnvelopeData } from "@nseng-ai/foundation/machine-envelope";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";
import {
	parseObjectiveListData,
	type ObjectiveListParseResult,
	type ObjectiveSelectionContext,
	type ObjectiveSelectionListLoadResult,
	type ObjectiveSelectionSpec,
} from "@nseng-ai/objectives/api";

import type {
	HerdrCreateTabOptions,
	HerdrCreateTabResult,
	HerdrCreateWorkspaceOptions,
	HerdrCreateWorkspaceResult,
	HerdrGateway,
	HerdrPaneRunResult,
	HerdrWorkspaceRenameResult,
} from "../src/core/herdr-gateway.ts";

type RawPiExecResultFixture = Partial<RawPiExecResult>;

export interface ExecCall {
	command: string;
	args: string[];
	options: RawPiExecOptions | undefined;
}

export interface ScriptedExec {
	command: string;
	args?: string[];
	result?: RawPiExecResultFixture;
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

export interface InputPrompt {
	title: string;
	placeholder: string | undefined;
}

export interface FakeCommandContextOptions {
	cwd?: string;
	hasUI?: boolean;
	inputValues?: Array<string | undefined>;
	onWaitForIdle?: () => void;
	selectIndices?: number[];
	shouldCancelSelect?: boolean;
	branchEntries?: unknown[];
}

export const ROOT = mkdtempSync(join(tmpdir(), "herdr-model-root-"));
writeFileSync(
	join(ROOT, "ns.toml"),
	'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
);
export const WORKTREE = "/slot/worktree";
export const BRANCH = "herdr-dispatch-feature";
export const PLAN_SLUG = "herdr-dispatch-feature";
export const PLAN_KEY = `${PLAN_SLUG}.md`;
export const SOURCE_BRANCH = "herdr-capability-parity";
export const START_POINT = "deadbeef1234567890abcdef1234567890abcdef";
export const PLAN_CONTENT = "# Plan\n";
export const REPO_ORIGIN_URL = "git@github.com:owner/repo.git";

// ---------------------------------------------------------------------------
// FakePi — scripted Pi ExtensionAPI for herdr tests
// ---------------------------------------------------------------------------

export class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, CommandDefinition>();
	readonly tools = new Map<string, { name: string }>();
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	readonly setModels: ModelInfo[] = [];
	readonly thinkingLevels: string[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;
	private readonly shouldRequireExpectedArgs: boolean;
	private thinkingLevel: ThinkingLevel = "medium";

	constructor(
		options: {
			script?: ScriptedExec[];
			shouldRequireExpectedArgs?: boolean;
		} = {},
	) {
		this.script = new ScriptedQueue(options.script ?? [], (s) => s);
		this.shouldRequireExpectedArgs = options.shouldRequireExpectedArgs ?? true;
	}

	on(): void {}

	registerCommand(name: string, options: CommandDefinition): void {
		this.commands.set(name, options);
	}

	registerTool(definition: { name: string }): void {
		this.tools.set(definition.name, definition);
	}

	getAllTools(): Array<{ name: string }> {
		return [...this.tools.values()];
	}

	async exec(
		command: string,
		args: string[],
		options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		if (
			command === "git" &&
			sameArgs(args, ["rev-parse", "--show-toplevel"]) &&
			!isGitRootStep(this.script.peek())
		) {
			return execResult({ stdout: `${options?.cwd ?? ROOT}\n` });
		}
		const missingStepMessage = `unexpected exec: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return execResult({ code: 99, stderr: missingStepMessage });
		}
		const { result, errorMessage } = runScriptedExec({
			expected,
			command,
			args,
			shouldRequireExpectedArgs: this.shouldRequireExpectedArgs,
		});
		if (errorMessage !== undefined) {
			this.script.recordError(errorMessage);
		}
		return result;
	}

	async loadObjectiveList(
		_ctx: ObjectiveSelectionContext,
		_spec: ObjectiveSelectionSpec,
	): Promise<ObjectiveSelectionListLoadResult> {
		const missingStepMessage = "unexpected objective list load";
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return { type: "failed", message: missingStepMessage };
		}
		if (
			expected.command !== "objective" ||
			!sameArgs(expected.args ?? [], ["list", "--format", "json"])
		) {
			const message = `expected objective list step, got ${expected.command} ${(expected.args ?? []).join(" ")}`;
			this.script.recordError(message);
			return { type: "failed", message };
		}
		const stdout = expected.result?.stdout ?? "";
		const parsed = parseObjectiveListStdout(stdout);
		if (parsed.type === "invalid") {
			const message = parsed.message;
			this.script.recordError(message);
			return { type: "failed", message };
		}
		return { type: "loaded", list: parsed.list };
	}

	getCommands(): readonly never[] {
		return [];
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

	assertDone(): void {
		this.script.assertDone();
	}
}

// ---------------------------------------------------------------------------
// FakeCommandContext
// ---------------------------------------------------------------------------

export class FakeCommandContext implements CommandContext {
	readonly cwd: string;
	readonly hasUI: boolean;
	readonly notifications: Notification[] = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly selections: Selection[] = [];
	readonly inputPrompts: InputPrompt[] = [];
	readonly autocompleteProviders: Array<(current: AutocompleteProvider) => AutocompleteProvider> =
		[];
	readonly events: string[] = [];
	readonly ui: CommandContext["ui"];
	readonly modelRegistry: CommandContext["modelRegistry"];
	readonly sessionManager: NonNullable<CommandContext["sessionManager"]>;
	waitCount = 0;
	shouldCancelSelect = false;
	private readonly inputValues: Array<string | undefined>;
	private readonly selectIndices: number[];
	private readonly onWaitForIdle: (() => void) | undefined;

	constructor(options: FakeCommandContextOptions = {}) {
		this.cwd = options.cwd ?? ROOT;
		this.hasUI = options.hasUI ?? true;
		this.inputValues = [...(options.inputValues ?? [])];
		this.onWaitForIdle = options.onWaitForIdle;
		this.selectIndices = [...(options.selectIndices ?? [0])];
		this.shouldCancelSelect = options.shouldCancelSelect ?? false;
		this.modelRegistry = { find: () => undefined };
		const branchEntries = options.branchEntries ?? [];
		this.sessionManager = {
			getBranch: () => branchEntries,
			getEntries: () => branchEntries,
		};
		this.ui = {
			notify: (message, level) => {
				this.events.push(`notify:${message}`);
				this.notifications.push({ message, level });
			},
			setStatus: (key, value) => {
				this.statuses.push({ key, value });
			},
			confirm: async () => true,
			input: async (title, placeholder) => {
				this.inputPrompts.push({ title, placeholder });
				return this.inputValues.shift();
			},
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
		this.events.push("wait-for-idle");
		this.onWaitForIdle?.();
		this.waitCount += 1;
	}
}

// ---------------------------------------------------------------------------
// FakeHerdrGateway
// ---------------------------------------------------------------------------

export interface FakeRenameCall {
	workspaceId: string;
	label: string;
}

export interface FakeCreateWorkspaceCall {
	options: HerdrCreateWorkspaceOptions;
}

export interface FakeCreateTabCall {
	options: HerdrCreateTabOptions;
}

export interface FakePaneRunCall {
	paneId: string;
	command: string;
}

export interface FakeHerdrGatewayOptions {
	renameResult?: HerdrWorkspaceRenameResult;
	createWorkspaceResult?: HerdrCreateWorkspaceResult;
	createTabResult?: HerdrCreateTabResult;
	paneRunResult?: HerdrPaneRunResult;
}

export class FakeHerdrGateway implements HerdrGateway {
	readonly renameCalls: FakeRenameCall[] = [];
	readonly createWorkspaceCalls: FakeCreateWorkspaceCall[] = [];
	readonly createTabCalls: FakeCreateTabCall[] = [];
	readonly paneRunCalls: FakePaneRunCall[] = [];

	private readonly renameResult: HerdrWorkspaceRenameResult;
	private readonly createWorkspaceResult: HerdrCreateWorkspaceResult;
	private readonly createTabResult: HerdrCreateTabResult;
	private readonly paneRunResult: HerdrPaneRunResult;

	constructor(options: FakeHerdrGatewayOptions = {}) {
		this.renameResult = options.renameResult ?? { type: "applied" };
		this.createWorkspaceResult = options.createWorkspaceResult ?? {
			type: "created",
			workspaceId: "fake-ws-1",
			rootPaneId: "fake-ws-1:p1",
			tabId: "fake-ws-1:t1",
		};
		this.createTabResult = options.createTabResult ?? {
			type: "created",
			tabId: "fake-ws-1:t2",
			rootPaneId: "fake-ws-1:p2",
			workspaceId: "fake-ws-1",
		};
		this.paneRunResult = options.paneRunResult ?? { type: "ok" };
	}

	async renameWorkspace(workspaceId: string, label: string): Promise<HerdrWorkspaceRenameResult> {
		this.renameCalls.push({ workspaceId, label });
		return this.renameResult;
	}

	async createWorkspace(options: HerdrCreateWorkspaceOptions): Promise<HerdrCreateWorkspaceResult> {
		this.createWorkspaceCalls.push({ options });
		return this.createWorkspaceResult;
	}

	async createTab(options: HerdrCreateTabOptions): Promise<HerdrCreateTabResult> {
		this.createTabCalls.push({ options });
		return this.createTabResult;
	}

	async runInPane(paneId: string, command: string): Promise<HerdrPaneRunResult> {
		this.paneRunCalls.push({ paneId, command });
		return this.paneRunResult;
	}
}

// ---------------------------------------------------------------------------
// Temp directory helpers
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

export async function resetHerdrTestEnvironment(): Promise<void> {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
}

export async function makeTempDir(): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "herdr-extension-test-")));
	await writeFile(
		join(dir, "ns.toml"),
		'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		"utf8",
	);
	tempDirs.push(dir);
	return dir;
}

// ---------------------------------------------------------------------------
// Scripted exec helpers
// ---------------------------------------------------------------------------

export function notificationMessages(ctx: FakeCommandContext): string[] {
	return ctx.notifications.map((n) => n.message);
}

export function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((v, i) => v === right[i]);
}

function isGitRootStep(expected: ScriptedExec | undefined): boolean {
	return (
		expected?.command === "git" && sameArgs(expected.args ?? [], ["rev-parse", "--show-toplevel"])
	);
}

export interface RunScriptedExecOptions {
	expected: ScriptedExec | undefined;
	command: string;
	args: string[];
	shouldRequireExpectedArgs?: boolean;
}

export interface RunScriptedExecResult {
	result: RawPiExecResult;
	errorMessage?: string;
}

export function runScriptedExec(options: RunScriptedExecOptions): RunScriptedExecResult {
	const { expected, command, args, shouldRequireExpectedArgs = true } = options;
	if (!expected) {
		const message = `unexpected exec: ${command} ${args.join(" ")}`;
		return { result: execResult({ code: 99, stderr: message }), errorMessage: message };
	}
	if (
		expected.command !== command ||
		expectedArgsMismatch(expected.args, args, shouldRequireExpectedArgs)
	) {
		const expectedArgs = expected.args === undefined ? "<unspecified>" : expected.args.join(" ");
		const message = `expected ${expected.command} ${expectedArgs}, got ${command} ${args.join(" ")}`;
		return { result: execResult({ code: 99, stderr: message }), errorMessage: message };
	}
	if (expected.error) {
		throw expected.error;
	}
	return { result: execResult(expected.result) };
}

function expectedArgsMismatch(
	expectedArgs: string[] | undefined,
	actualArgs: string[],
	shouldRequireExpectedArgs: boolean,
): boolean {
	if (expectedArgs === undefined) {
		return shouldRequireExpectedArgs;
	}
	return !sameArgs(expectedArgs, actualArgs);
}

export function execResult(overrides: RawPiExecResultFixture = {}): RawPiExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

export function step(
	command: string,
	args: string[] | undefined,
	result?: RawPiExecResultFixture,
): ScriptedExec {
	return {
		command,
		...optionalEntries({ args, result }),
	};
}

// ---------------------------------------------------------------------------
// Common scripted exec steps for herdr sidebar tests
// ---------------------------------------------------------------------------

export function objectiveListStep(slugs: string[]): ScriptedExec {
	return step("objective", ["list", "--format", "json"], {
		stdout: JSON.stringify({
			exitCode: 0,
			data: {
				trunkBranch: "master",
				rootPath: ".ns/objectives",
				statusFilter: "active",
				namesOnly: false,
				records: slugs.map((slug, index) => ({
					slug,
					status: "open",
					latestUpdateIso: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
					hasOutstandingChanges: false,
				})),
			},
		}),
	});
}

export function objectiveReadStep(slug: string): ScriptedExec {
	return step("ns", ["objective", "exec", "read-objective", slug, "--format", "json"], {
		stdout: JSON.stringify({
			exitCode: 0,
			data: { status: "ok", slug },
		}),
	});
}

export function objectiveDiffStep(
	stdout: string,
	result: RawPiExecResultFixture = {},
): ScriptedExec {
	return step("git", ["diff", "--name-status", "-M", "master...HEAD", "--", ".ns/objectives"], {
		stdout,
		...result,
	});
}

export function objectiveStatusStep(
	stdout: string,
	result: RawPiExecResultFixture = {},
): ScriptedExec {
	return step("git", ["status", "--porcelain=v1", "-z", "--", ".ns/objectives"], {
		stdout,
		...result,
	});
}

// ---------------------------------------------------------------------------
// Plan store helpers (mirrors cmux-test-harness equivalents)
// ---------------------------------------------------------------------------

export function gitRootStep(repoRoot: string): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${repoRoot}\n` });
}

export function gitCurrentBranchStep(): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${SOURCE_BRANCH}\n` });
}

export function gitOriginStep(): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], {
		stdout: `${REPO_ORIGIN_URL}\n`,
	});
}

export function headStep(): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], { stdout: `${START_POINT}\n` });
}

export function dispatchValidationScript(repoRoot: string): ScriptedExec[] {
	return [gitRootStep(repoRoot), gitCurrentBranchStep(), gitOriginStep()];
}

export function herdrPlanStoreDirectory(planStoreRoot: string, repoRoot: string): string {
	const repoKey = buildRepoPlanStoreKey(repoRoot, normalizeRepoOriginUrl(REPO_ORIGIN_URL));
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	return join(planStoreRoot, repoKey, branchKey);
}

export async function writePlanStoreFile(
	planStoreRoot: string,
	repoRoot: string,
	options: { fileName?: string; content?: string } = {},
): Promise<string> {
	const directoryPath = herdrPlanStoreDirectory(planStoreRoot, repoRoot);
	await mkdir(directoryPath, { recursive: true });
	const planFile = join(directoryPath, options.fileName ?? `${PLAN_SLUG}.md`);
	await writeFile(planFile, options.content ?? PLAN_CONTENT, "utf8");
	return planFile;
}

export function savedPlanEntry(
	repoRoot: string,
	planFile: string,
	overrides: Record<string, unknown> = {},
): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "write_saved_plan_file",
			isError: false,
			details: {
				slug: PLAN_SLUG,
				repoRoot,
				repoKey: buildRepoPlanStoreKey(repoRoot, normalizeRepoOriginUrl(REPO_ORIGIN_URL)),
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

function parseObjectiveListStdout(stdout: string): ObjectiveListParseResult {
	const envelope = parseMachineEnvelopeData(stdout, { label: "objective list JSON" });
	if (envelope.type !== "valid") {
		return { type: "invalid", message: envelope.message };
	}
	return parseObjectiveListData(envelope.data);
}
