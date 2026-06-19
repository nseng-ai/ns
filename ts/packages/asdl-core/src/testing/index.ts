import { spawnSync } from "node:child_process";
import { mkdir, readFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import type { Clock } from "../clock.ts";
import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "../exec.ts";
import type { ScheduledTimer, TimerScheduler } from "../timers.ts";

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

export interface ManualClock {
	readonly clock: Clock;
	nowMs(): number;
	setMs(nowMs: number): void;
	advanceMs(deltaMs: number): void;
}

export interface ManualTimerScheduler {
	readonly timers: TimerScheduler;
	advanceMs(deltaMs: number): void;
	runNextTimer(): boolean;
	pendingTimerCount(): number;
}

export interface StepOptions extends ResultFields {}

export interface ScriptStep extends ResultFields {
	readonly command: string;
	readonly args: readonly string[];
}

export interface ScriptedCommandExecCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options?: ExecOptions | undefined;
}

export class ScriptedCommandRunner {
	private readonly callsInternal: RunnerCall[] = [];
	private readonly errors: string[] = [];
	private readonly script: ScriptStep[];

	constructor(script: readonly ScriptStep[]) {
		this.script = script.map(copyScriptStep);
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
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected command: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return result({ exitCode: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
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
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
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
	return JSON.stringify({ exit_code: 0, data: { present } });
}

export function createManualClock(startMs: number): ManualClock {
	let currentMs = validateFiniteMs(startMs, "startMs");
	const clock: Clock = {
		nowMs: () => currentMs,
	};

	return {
		clock,
		nowMs() {
			return currentMs;
		},
		setMs(nowMs) {
			currentMs = validateFiniteMs(nowMs, "nowMs");
		},
		advanceMs(deltaMs) {
			currentMs = validateFiniteMs(currentMs + validateDeltaMs(deltaMs), "nowMs");
		},
	};
}

export function createManualTimerScheduler(): ManualTimerScheduler {
	let currentMs = 0;
	let nextId = 0;
	const scheduledTimers: ManualScheduledTimerState[] = [];

	function runTimer(timer: ManualScheduledTimerState): void {
		timer.hasFired = true;
		currentMs = timer.dueMs;
		timer.callback();
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

	return {
		timers: {
			setTimeout(callback, delayMs): ScheduledTimer {
				const normalizedDelayMs = Math.max(0, validateFiniteMs(delayMs, "delayMs"));
				const timer: ManualScheduledTimerState = {
					id: nextId,
					dueMs: validateFiniteMs(currentMs + normalizedDelayMs, "dueMs"),
					callback,
					isCancelled: false,
					hasFired: false,
				};
				nextId += 1;
				scheduledTimers.push(timer);
				return {
					cancel() {
						timer.isCancelled = true;
					},
				};
			},
		},
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
		async makeTempDir(prefix = "asdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
			tempDirs.push(dir);
			return dir;
		},
		async makeHomeTempDir(prefix = ".asdl-test-"): Promise<string> {
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

interface ManualScheduledTimerState {
	readonly id: number;
	readonly dueMs: number;
	readonly callback: () => void;
	isCancelled: boolean;
	hasFired: boolean;
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

function copyScriptStep(stepValue: ScriptStep): ScriptStep {
	return { ...stepValue, args: [...stepValue.args] };
}
