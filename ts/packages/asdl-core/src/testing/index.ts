import { spawnSync } from "node:child_process";
import { mkdir, readFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "../exec.ts";

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
	readonly killed?: boolean;
}

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
		return this.callsInternal.map((call) => ({ command: call.command, args: [...call.args], ...(call.cwd === undefined ? {} : { cwd: call.cwd }) }));
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
		this.results = results.map((fields) => ({ stdout: "", stderr: "", code: 0, killed: false, ...fields }));
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.callsInternal.push({ command, args: [...args], ...(options === undefined ? {} : { options: { ...options } }) });
		return this.results.shift() ?? { stdout: "", stderr: "", code: 0, killed: false };
	}

	calls(): readonly ScriptedCommandExecCall[] {
		return this.callsInternal.map((call) => ({ command: call.command, args: [...call.args], ...(call.options === undefined ? {} : { options: { ...call.options } }) }));
	}
}

export function step(command: string, args: readonly string[], stdout = "", exitCode = 0, stderr = ""): ScriptStep {
	return { command, args: [...args], stdout, exitCode, stderr };
}

export function startupErrorStep(command: string, args: readonly string[], startupError: string): ScriptStep {
	return { command, args: [...args], exitCode: 127, startupError };
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
			const result = spawnSync(process.execPath, [options.cliSourcePathFromWorkspace, "--runtime"], {
				cwd: workspaceRoot,
				encoding: "utf8",
			});

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
			await Promise.all([...dirs, ...homes].map((dir) => rm(dir, { recursive: true, force: true })));
		},
	};
}

export async function withTempRepoSkill<T>(options: TempRepoSkillOptions, callback: (skill: TempRepoSkill) => Promise<T>): Promise<T> {
	const repoDir = await realpath(await mkdtemp(join(tmpdir(), options.prefix ?? `${options.skillName}-repo-`)));
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

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function result(fields: ResultFields): ExecResult {
	return {
		code: fields.exitCode ?? 0,
		stdout: fields.stdout ?? "",
		stderr: fields.startupError ?? fields.stderr ?? "",
		killed: fields.killed === true,
		...(fields.startupError === undefined ? {} : { startupError: fields.startupError }),
	};
}

function copyScriptStep(stepValue: ScriptStep): ScriptStep {
	return { ...stepValue, args: [...stepValue.args] };
}
