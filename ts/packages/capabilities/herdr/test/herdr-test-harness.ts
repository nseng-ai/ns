import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
} from "@nseng-ai/capability-kit/cmux/types";
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

import type { HerdrGateway, HerdrWorkspaceRenameResult } from "../src/core/herdr-gateway.ts";

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

export interface FakeCommandContextOptions {
	cwd?: string;
	selectIndices?: number[];
	shouldCancelSelect?: boolean;
}

export const ROOT = "/repo";
export const SOURCE_BRANCH = "herdr-capability-parity";

// ---------------------------------------------------------------------------
// FakePi — scripted Pi ExtensionAPI for herdr tests
// ---------------------------------------------------------------------------

export class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, CommandDefinition>();
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

	async exec(
		command: string,
		args: string[],
		options?: RawPiExecOptions,
	): Promise<RawPiExecResult> {
		this.execCalls.push({ command, args: [...args], options });
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
	readonly hasUI = true;
	readonly notifications: Notification[] = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly selections: Selection[] = [];
	readonly autocompleteProviders: Array<(current: AutocompleteProvider) => AutocompleteProvider> =
		[];
	readonly ui: CommandContext["ui"];
	readonly modelRegistry: CommandContext["modelRegistry"];
	readonly sessionManager: NonNullable<CommandContext["sessionManager"]>;
	waitCount = 0;
	shouldCancelSelect = false;
	private readonly selectIndices: number[];

	constructor(options: FakeCommandContextOptions = {}) {
		this.cwd = options.cwd ?? ROOT;
		this.selectIndices = [...(options.selectIndices ?? [0])];
		this.shouldCancelSelect = options.shouldCancelSelect ?? false;
		this.modelRegistry = { find: () => undefined };
		this.sessionManager = {
			getBranch: () => [],
			getEntries: () => [],
		};
		this.ui = {
			notify: (message, level) => {
				this.notifications.push({ message, level });
			},
			setStatus: (key, value) => {
				this.statuses.push({ key, value });
			},
			confirm: async () => true,
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

// ---------------------------------------------------------------------------
// FakeHerdrGateway
// ---------------------------------------------------------------------------

export interface FakeRenameCall {
	workspaceId: string;
	label: string;
}

export class FakeHerdrGateway implements HerdrGateway {
	readonly renameCalls: FakeRenameCall[] = [];
	private readonly renameResult: HerdrWorkspaceRenameResult;

	constructor(options: { renameResult?: HerdrWorkspaceRenameResult } = {}) {
		this.renameResult = options.renameResult ?? { type: "applied" };
	}

	async renameWorkspace(workspaceId: string, label: string): Promise<HerdrWorkspaceRenameResult> {
		this.renameCalls.push({ workspaceId, label });
		return this.renameResult;
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

function parseObjectiveListStdout(stdout: string): ObjectiveListParseResult {
	const envelope = parseMachineEnvelopeData(stdout, { label: "objective list JSON" });
	if (envelope.type !== "valid") {
		return { type: "invalid", message: envelope.message };
	}
	return parseObjectiveListData(envelope.data);
}
