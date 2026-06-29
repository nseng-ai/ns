import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import type { Clock } from "../clock.ts";
import {
	NodeCommandExecApi,
	type CommandExecApi,
	type CommandRunner,
	type ExecOptions,
	type ExecResult,
} from "../exec.ts";
import { TimerScheduler, type ScheduledTimer } from "../timers.ts";
export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: string;
}

export interface TextGenerationUsage {
	inputTokens: number;
	outputTokens: number;
}

export type TextGenerationResult =
	| { ok: true; text: string; usage?: TextGenerationUsage }
	| { ok: false; error: string };

export interface TextGenerator {
	generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export interface NodeRuntimeCliEntrypointOptions {
	readonly name: string;
	readonly workspaceRoot: URL;
	readonly cliSourcePathFromWorkspace: string;
	readonly cliSourceUrl: URL;
	readonly helpAssertions: readonly NodeRuntimeHelpAssertion[];
	readonly runtimeDiagnostics: string;
}

export type NodeRuntimeHelpAssertion =
	| { readonly type: "contains"; readonly text: string }
	| { readonly type: "not_contains"; readonly text: string };

export interface TempDirTracker {
	makeTempDir(prefix?: string): Promise<string>;
	makeHomeTempDir(prefix?: string): Promise<string>;
	cleanup(): Promise<void>;
}

export interface TempRepoSkill {
	readonly repoDir: string;
	readonly skillDir: string;
	readonly skillPath: string;
}

export interface TempRepoSkillOptions {
	readonly skillName: string;
	readonly markdown: string;
	readonly prefix?: string;
}

export interface TempGitRepo {
	readonly path: string;
	runGit(args: readonly string[], options?: TempGitRepoRunOptions): string;
	cleanup(): void;
}

export interface TempGitRepoOptions {
	readonly prefix?: string;
	readonly userEmail?: string;
	readonly userName?: string;
	readonly readmeText?: string;
	readonly initialCommitMessage?: string;
}

export interface TempGitRepoRunOptions {
	readonly input?: string | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
}

export interface DropExecOptionsFields {
	readonly shouldDropEnv?: boolean;
	readonly shouldDropStdin?: boolean;
}

export interface DroppingOptionsCommandExecApiOptions extends DropExecOptionsFields {
	readonly delegate?: CommandExecApi;
}

export interface RunnerCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly cwd?: string | undefined;
}

export interface ResultFields {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly exitCode?: number;
	readonly startupError?: string;
	readonly isKilled?: boolean;
}

export interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
}

export interface ManualClock {
	readonly clock: Clock;
	setMs(nowMs: number): void;
	advanceMs(deltaMs: number): void;
}

export interface ManualTimerScheduler {
	readonly timers: TimerScheduler;
	advanceMs(deltaMs: number): void;
	runNextTimer(): boolean;
	pendingTimerCount(): number;
}

export interface ManualTimerHarness extends ManualTimerScheduler {
	readonly clock: Clock;
	nowMs(): number;
}

export type StepOptions = ResultFields;

export interface ScriptStep extends ResultFields {
	readonly command: string;
	readonly args: readonly string[];
}

export interface ScriptedCommandExecCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options?: ExecOptions | undefined;
}

export type ScriptedTextGenerationStep = TextGenerationResult | Promise<TextGenerationResult>;

export interface GithubCheckRunFixture {
	readonly workflowName: string;
	readonly name: string;
	readonly status: string;
	readonly conclusion?: string | undefined;
	readonly startedAt?: string | undefined;
	readonly completedAt?: string | undefined;
}

export function githubCheckRun(fixture: GithubCheckRunFixture): unknown {
	return {
		__typename: "CheckRun",
		name: fixture.name,
		status: fixture.status,
		...(fixture.conclusion === undefined ? {} : { conclusion: fixture.conclusion }),
		...(fixture.startedAt === undefined ? {} : { startedAt: fixture.startedAt }),
		...(fixture.completedAt === undefined ? {} : { completedAt: fixture.completedAt }),
		checkSuite: { workflowRun: { workflow: { name: fixture.workflowName } } },
	};
}

/** Internal monorepo testing helper for ordered scripted expectations. */
export class ScriptedQueue<TStep> {
	private readonly errors: string[] = [];
	private readonly steps: TStep[];

	constructor(steps: readonly TStep[], copyStep: (step: TStep) => TStep) {
		this.steps = steps.map(copyStep);
	}

	shiftOrRecordError(message: string): TStep | undefined {
		const stepValue = this.steps.shift();
		if (stepValue === undefined) {
			this.recordError(message);
		}
		return stepValue;
	}

	recordError(message: string): void {
		this.errors.push(message);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.steps).toEqual([]);
	}
}

export class ScriptedCommandRunner {
	private readonly callsInternal: RunnerCall[] = [];
	private readonly script: ScriptedQueue<ScriptStep>;

	constructor(script: readonly ScriptStep[]) {
		this.script = new ScriptedQueue(script, copyScriptStep);
	}

	get calls(): readonly RunnerCall[] {
		return this.callsInternal.map((call) => ({
			command: call.command,
			args: [...call.args],
			...(call.cwd === undefined ? {} : { cwd: call.cwd }),
		}));
	}

	readonly runner: CommandRunner = async (command, args, options = {}) => {
		this.callsInternal.push({ command, args: [...args], cwd: options.cwd });
		const missingStepMessage = `unexpected command: ${command} ${args.join(" ")}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) {
			return result({ exitCode: 99, stderr: missingStepMessage });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.script.recordError(message);
			return result({ exitCode: 99, stderr: message });
		}

		const commandResult = result(expected);
		if (commandResult.stdout !== "") {
			options.onStdout?.(commandResult.stdout);
		}
		if (commandResult.stderr !== "") {
			options.onStderr?.(commandResult.stderr);
		}
		return commandResult;
	};

	assertDone(): void {
		this.script.assertDone();
	}
}

export class ScriptedCommandExecApi implements CommandExecApi {
	private readonly results: ExecResult[];
	private readonly callsInternal: ScriptedCommandExecCall[] = [];

	constructor(results: readonly Partial<ExecResult>[] = []) {
		this.results = results.map((fields) => ({
			stdout: "",
			stderr: "",
			code: 0,
			killed: false,
			...fields,
		}));
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.callsInternal.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options: { ...options } }),
		});
		return this.results.shift() ?? { stdout: "", stderr: "", code: 0, killed: false };
	}

	calls(): readonly ScriptedCommandExecCall[] {
		return this.callsInternal.map((call) => ({
			command: call.command,
			args: [...call.args],
			...(call.options === undefined ? {} : { options: { ...call.options } }),
		}));
	}
}

export class DroppingOptionsCommandExecApi implements CommandExecApi {
	// Some tests deliberately brand this wrapper as stdin-capable while dropping
	// stdin to prove downstream runtime guards fail safe when adapters lie.
	readonly supportsStdin = true as const;
	private readonly delegate: CommandExecApi;
	private readonly dropFields: DropExecOptionsFields;

	constructor(options: DroppingOptionsCommandExecApiOptions = {}) {
		this.delegate = options.delegate ?? new NodeCommandExecApi();
		this.dropFields = {
			...(options.shouldDropEnv === undefined ? {} : { shouldDropEnv: options.shouldDropEnv }),
			...(options.shouldDropStdin === undefined
				? {}
				: { shouldDropStdin: options.shouldDropStdin }),
		};
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		return await this.delegate.exec(
			command,
			args,
			copyExecOptionsWithout(options, this.dropFields),
		);
	}
}

export function copyExecOptionsWithout(
	options: ExecOptions | undefined,
	dropFields: DropExecOptionsFields,
): ExecOptions | undefined {
	if (options === undefined) return undefined;
	return {
		...(options.cwd === undefined ? {} : { cwd: options.cwd }),
		...(dropFields.shouldDropEnv === true || options.env === undefined ? {} : { env: options.env }),
		...(options.timeout === undefined ? {} : { timeout: options.timeout }),
		...(options.timeoutKillGraceMs === undefined
			? {}
			: { timeoutKillGraceMs: options.timeoutKillGraceMs }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
		...(dropFields.shouldDropStdin === true || options.stdin === undefined
			? {}
			: { stdin: options.stdin }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
}

export class ScriptedTextGenerator implements TextGenerator {
	private readonly requestsInternal: TextGenerationRequest[] = [];
	private readonly script: ScriptedQueue<ScriptedTextGenerationStep>;

	constructor(script: readonly ScriptedTextGenerationStep[]) {
		this.script = new ScriptedQueue(script, copyIdentity);
	}

	get requests(): readonly TextGenerationRequest[] {
		return this.requestsInternal.map(copyTextGenerationRequest);
	}

	readonly generateText: TextGenerator["generateText"] = async (request) => {
		this.requestsInternal.push(copyTextGenerationRequest(request));
		const message = "unexpected text generation request";
		const result = this.script.shiftOrRecordError(message);
		if (result === undefined) {
			return { ok: false, error: message };
		}
		return await result;
	};

	assertDone(): void {
		this.script.assertDone();
	}
}

export function step(
	command: string,
	args: readonly string[],
	options: StepOptions = {},
): ScriptStep {
	return { command, args: [...args], ...options };
}

export function startupErrorStep(
	command: string,
	args: readonly string[],
	startupError: string,
): ScriptStep {
	return { command, args: [...args], exitCode: 127, startupError };
}

export function brmemCheckJson(present: boolean): string {
	return JSON.stringify({ exitCode: 0, data: { present } });
}

export function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	if (resolve === undefined) throw new Error("Deferred promise did not initialize");
	return { promise, resolve };
}

export function createManualClock(startMs: number): ManualClock {
	let currentMs = validateFiniteMs(startMs, "startMs");
	const clock: Clock = {
		nowMs: () => currentMs,
	};

	return {
		clock,
		setMs(nowMs) {
			currentMs = validateFiniteMs(nowMs, "nowMs");
		},
		advanceMs(deltaMs) {
			currentMs = validateFiniteMs(currentMs + validateDeltaMs(deltaMs), "nowMs");
		},
	};
}

// Narrow scheduler-only convenience; delegates to the harness so manual timer behavior has one implementation.
export function createManualTimerScheduler(): ManualTimerScheduler {
	return createManualTimerHarness();
}

export function createManualTimerHarness(startMs = 0): ManualTimerHarness {
	let currentMs = validateFiniteMs(startMs, "startMs");
	let nextId = 0;
	const scheduledTimers: ManualScheduledTimerState[] = [];

	function runTimer(timer: ManualScheduledTimerState): void {
		timer.hasFired = true;
		currentMs = timer.dueMs;
		timer.callback();
		if (timer.kind === "interval" && !timer.isCancelled) {
			timer.hasFired = false;
			timer.dueMs = validateFiniteMs(currentMs + timer.intervalMs, "dueMs");
		}
	}

	function nextPendingTimer(): ManualScheduledTimerState | undefined {
		let earliest: ManualScheduledTimerState | undefined;
		for (const timer of scheduledTimers) {
			if (!isPendingTimer(timer)) continue;
			if (
				earliest === undefined ||
				timer.dueMs < earliest.dueMs ||
				(timer.dueMs === earliest.dueMs && timer.id < earliest.id)
			) {
				earliest = timer;
			}
		}
		return earliest;
	}

	const timers = new ManualTimerSchedulerImpl({
		nowMs: () => currentMs,
		allocateId: () => {
			const id = nextId;
			nextId += 1;
			return id;
		},
		pushTimer: (timer) => scheduledTimers.push(timer),
	});

	return {
		clock: {
			nowMs: () => currentMs,
		},
		nowMs() {
			return currentMs;
		},
		timers,
		advanceMs(deltaMs) {
			const targetMs = validateFiniteMs(currentMs + validateDeltaMs(deltaMs), "targetMs");
			let nextTimer = nextPendingTimer();
			while (nextTimer !== undefined && nextTimer.dueMs <= targetMs) {
				runTimer(nextTimer);
				nextTimer = nextPendingTimer();
			}
			currentMs = targetMs;
		},
		runNextTimer() {
			const timer = nextPendingTimer();
			if (timer === undefined) return false;
			runTimer(timer);
			return true;
		},
		pendingTimerCount() {
			return scheduledTimers.filter(isPendingTimer).length;
		},
	};
}

export function describeNodeRuntimeCliEntrypoint(options: NodeRuntimeCliEntrypointOptions): void {
	const workspaceRoot = fileURLToPath(options.workspaceRoot);

	describe(options.name, () => {
		test("the committed source has a Node shebang", async () => {
			const source = await readFile(options.cliSourceUrl, "utf8");

			expect(source.split("\n", 1)[0]).toBe("#!/usr/bin/env node");
		});

		test("Node executes the TypeScript source entrypoint directly", () => {
			const result = spawnSync(process.execPath, [options.cliSourcePathFromWorkspace, "--help"], {
				cwd: workspaceRoot,
				encoding: "utf8",
			});

			expect(result.status, result.stderr).toBe(0);
			for (const assertion of options.helpAssertions) {
				if (assertion.type === "contains") {
					expect(result.stdout).toContain(assertion.text);
				} else {
					expect(result.stdout).not.toContain(assertion.text);
				}
			}
		});

		test("prints TypeScript runtime diagnostics", () => {
			const result = spawnSync(
				process.execPath,
				[options.cliSourcePathFromWorkspace, "--runtime"],
				{
					cwd: workspaceRoot,
					encoding: "utf8",
				},
			);

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toBe(options.runtimeDiagnostics);
		});
	});
}

export function createTempDirTracker(): TempDirTracker {
	const tempDirs: string[] = [];
	const homeTempDirs: string[] = [];

	return {
		async makeTempDir(prefix = "sdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
			tempDirs.push(dir);
			return dir;
		},
		async makeHomeTempDir(prefix = ".sdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(homedir(), prefix)));
			homeTempDirs.push(dir);
			return dir;
		},
		async cleanup(): Promise<void> {
			const dirs = tempDirs.splice(0);
			const homes = homeTempDirs.splice(0);
			await Promise.all(
				[...dirs, ...homes].map((dir) => rm(dir, { recursive: true, force: true })),
			);
		},
	};
}

export function createTempGitRepo(options: TempGitRepoOptions = {}): TempGitRepo {
	const path = mkdtempSync(join(tmpdir(), options.prefix ?? "sdl-git-test-"));
	const runGit = (args: readonly string[], runOptions: TempGitRepoRunOptions = {}): string => {
		const result = spawnSync("git", [...args], {
			cwd: path,
			input: runOptions.input,
			encoding: "utf8",
			...(runOptions.env === undefined ? {} : { env: runOptions.env }),
		});
		if (result.status !== 0) {
			throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
		}
		return result.stdout;
	};

	runGit(["init", "-b", "main"]);
	runGit(["config", "user.email", options.userEmail ?? "sdl-test@example.com"]);
	runGit(["config", "user.name", options.userName ?? "SDL Test"]);
	writeFileSync(join(path, "README.md"), options.readmeText ?? "test repo\n", "utf8");
	runGit(["add", "README.md"]);
	runGit(["commit", "-m", options.initialCommitMessage ?? "initial"]);

	return {
		path,
		runGit,
		cleanup() {
			rmSync(path, { recursive: true, force: true });
		},
	};
}

export async function withTempRepoSkill<T>(
	options: TempRepoSkillOptions,
	callback: (skill: TempRepoSkill) => Promise<T>,
): Promise<T> {
	const repoDir = await realpath(
		await mkdtemp(join(tmpdir(), options.prefix ?? `${options.skillName}-repo-`)),
	);
	const skillDir = join(repoDir, "skills", options.skillName);
	const skillPath = join(skillDir, "SKILL.md");
	await mkdir(skillDir, { recursive: true });
	await writeFile(skillPath, options.markdown, "utf8");
	try {
		return await callback({ repoDir, skillDir, skillPath });
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
}

class ManualTimerSchedulerImpl extends TimerScheduler {
	private readonly options: ManualTimerSchedulerImplOptions;

	constructor(options: ManualTimerSchedulerImplOptions) {
		super();
		this.options = options;
	}

	setTimeout(callback: () => void, delayMs: number): ScheduledTimer {
		const normalizedDelayMs = Math.max(0, validateFiniteMs(delayMs, "delayMs"));
		const timer: ManualScheduledTimerState = {
			kind: "timeout",
			id: this.options.allocateId(),
			dueMs: validateFiniteMs(this.options.nowMs() + normalizedDelayMs, "dueMs"),
			callback,
			isCancelled: false,
			hasFired: false,
		};
		this.options.pushTimer(timer);
		return {
			cancel() {
				timer.isCancelled = true;
			},
		};
	}

	setInterval(callback: () => void, delayMs: number): ScheduledTimer {
		const normalizedDelayMs = Math.max(1, validateFiniteMs(delayMs, "delayMs"));
		const timer: ManualScheduledTimerState = {
			kind: "interval",
			id: this.options.allocateId(),
			dueMs: validateFiniteMs(this.options.nowMs() + normalizedDelayMs, "dueMs"),
			intervalMs: normalizedDelayMs,
			callback,
			isCancelled: false,
			hasFired: false,
		};
		this.options.pushTimer(timer);
		return {
			cancel() {
				timer.isCancelled = true;
			},
		};
	}
}

interface ManualTimerSchedulerImplOptions {
	nowMs(): number;
	allocateId(): number;
	pushTimer(timer: ManualScheduledTimerState): void;
}

type ManualScheduledTimerState = ManualTimeoutState | ManualIntervalState;

interface ManualTimerStateBase {
	readonly id: number;
	readonly callback: () => void;
	dueMs: number;
	isCancelled: boolean;
	hasFired: boolean;
}

interface ManualTimeoutState extends ManualTimerStateBase {
	readonly kind: "timeout";
}

interface ManualIntervalState extends ManualTimerStateBase {
	readonly kind: "interval";
	readonly intervalMs: number;
}

function isPendingTimer(timer: ManualScheduledTimerState): boolean {
	return !timer.isCancelled && !timer.hasFired;
}

function validateFiniteMs(value: number, name: string): number {
	if (!Number.isFinite(value)) {
		throw new Error(`${name} must be finite`);
	}
	return value;
}

function validateDeltaMs(deltaMs: number): number {
	validateFiniteMs(deltaMs, "deltaMs");
	if (deltaMs < 0) {
		throw new Error("deltaMs must be non-negative");
	}
	return deltaMs;
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function result(fields: ResultFields): ExecResult {
	return {
		code: fields.exitCode ?? 0,
		stdout: fields.stdout ?? "",
		stderr: fields.startupError ?? fields.stderr ?? "",
		killed: fields.isKilled === true,
		...(fields.startupError === undefined ? {} : { startupError: fields.startupError }),
	};
}

function copyIdentity<TValue>(value: TValue): TValue {
	return value;
}

function copyScriptStep(stepValue: ScriptStep): ScriptStep {
	return { ...stepValue, args: [...stepValue.args] };
}

function copyTextGenerationRequest(request: TextGenerationRequest): TextGenerationRequest {
	return {
		modelRef: request.modelRef,
		system: request.system,
		prompt: request.prompt,
		...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
		...(request.reasoning === undefined ? {} : { reasoning: request.reasoning }),
		...(request.operation === undefined ? {} : { operation: request.operation }),
	};
}
