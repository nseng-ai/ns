import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, test } from "vitest";

import { type ExecResult, formatCommandResultFailure } from "@sdl/core/command";
import { runCommand } from "@sdl/core/exec";
import { executeStackLanding, parseArgs } from "../../src/land/land-stack.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	LandingShape,
	NotifyLevel,
} from "../../src/land/stack/types.ts";

const COMMAND_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 120_000;
const TEMP_ROOT_CLEANUP_RETRIES = 5;
const TEMP_ROOT_CLEANUP_RETRY_DELAY_MS = 100;

const TRUNK = "main";
const FEATURE_A = "feature-a";
const FEATURE_B = "feature-b";
const FEATURE_C = "feature-c";
const FEATURE_D = "feature-d";
const ROGUE = "rogue-branch";

interface SandboxPr {
	number: number;
	title: string;
	body: string | null;
	state: string;
	isDraft: boolean;
	headRefName: string;
	baseRefName: string;
	headRefOid: string;
	mergeStateStatus: string;
	url: string;
	mergedAt: string | null;
}

interface SandboxTopologyRow {
	branch: string;
	parent?: string;
	children?: string[];
	trunk?: boolean;
}

interface SandboxCommandLogEntry {
	command: string;
	args: string[];
}

interface SandboxState {
	prs: Record<string, SandboxPr>;
	topology: SandboxTopologyRow[];
	commandLog: SandboxCommandLogEntry[];
	gtGetFailures?: Record<string, { code: number; stderr: string }>;
}

interface Sandbox {
	tempRoot: string;
	repoRoot: string;
	statePath: string;
	env: NodeJS.ProcessEnv;
	shas: Record<string, string>;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

describe("land stack sandbox integration", () => {
	test(
		"lands a two-branch stack through real git and fake gh/gt/sdl shims without deleting descendants",
		async () => {
			await withSandbox({ currentBranch: FEATURE_B }, async (sandbox) => {
				const result = await executeSandboxLanding(sandbox, {
					initialShape: multiRootInitialShape(sandbox),
				});

				expect(result.outcome.type).toBe("success");
				const log = await readCommandLog(sandbox);
				expect(commandArgs(log, "gh", "pr", "merge")).toEqual([
					[
						"pr",
						"merge",
						"101",
						"--squash",
						"--match-head-commit",
						sandbox.shas[FEATURE_A],
						"--subject",
						"PR 101",
						"--body",
						"Body for PR 101",
					],
					[
						"pr",
						"merge",
						"102",
						"--squash",
						"--match-head-commit",
						sandbox.shas[FEATURE_B],
						"--subject",
						"PR 102",
						"--body",
						"Body for PR 102",
					],
				]);
				expect(commandArgs(log, "gt", "delete").map((args) => args[1])).toEqual([
					FEATURE_A,
					FEATURE_B,
				]);
				expect(commandArgs(log, "gt", "delete").map((args) => args[1])).not.toContain(FEATURE_C);
				expect(commandArgs(log, "gt", "delete").map((args) => args[1])).not.toContain(FEATURE_D);
				expect(commandIndex(log, "gh", ["pr", "merge", "101"])).toBeLessThan(
					commandIndex(log, "gt", ["get", FEATURE_B]),
				);
				expect(commandIndex(log, "gt", ["get", FEATURE_B])).toBeLessThan(
					commandIndex(log, "gt", ["delete", FEATURE_A]),
				);
				expect(commandIndex(log, "gt", ["delete", FEATURE_A])).toBeLessThan(
					commandIndex(log, "gt", ["restack", "--branch", FEATURE_B]),
				);
				expect(commandIndex(log, "gt", ["restack", "--branch", FEATURE_B])).toBeLessThan(
					commandIndex(log, "gt", ["submit", "--branch", FEATURE_B]),
				);
				expect(commandIndex(log, "gh", ["pr", "merge", "102"])).toBeLessThan(
					commandIndex(log, "gt", ["get", FEATURE_C]),
				);

				const branches = await localBranches(sandbox);
				expect(branches).not.toContain(FEATURE_A);
				expect(branches).toContain(FEATURE_B);
				expect(branches).toContain(FEATURE_C);
				expect(branches).toContain(FEATURE_D);
			});
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"keeps landed and descendant refs when one optional descendant refresh fails after later roots are attempted",
		async () => {
			await withSandbox(
				{
					currentBranch: FEATURE_B,
					state: {
						gtGetFailures: {
							[FEATURE_C]: { code: 1, stderr: "refresh failed\n" },
						},
					},
				},
				async (sandbox) => {
					const result = await executeSandboxLanding(sandbox, {
						initialShape: multiRootInitialShape(sandbox),
					});

					expect(result.outcome.type).toBe("success");
					const log = await readCommandLog(sandbox);
					expect(commandIndex(log, "gt", ["get", FEATURE_C])).toBeGreaterThanOrEqual(0);
					expect(commandIndex(log, "gt", ["get", FEATURE_D])).toBeGreaterThan(
						commandIndex(log, "gt", ["get", FEATURE_C]),
					);
					expect(commandArgs(log, "gt", "delete").map((args) => args[1])).not.toContain(FEATURE_B);
					expect(commandArgs(log, "gt", "restack").map((args) => args[2])).not.toContain(FEATURE_C);
					expect(commandArgs(log, "gt", "restack").map((args) => args[2])).not.toContain(FEATURE_D);

					const branches = await localBranches(sandbox);
					expect(branches).toContain(FEATURE_B);
					expect(branches).toContain(FEATURE_C);
					expect(branches).toContain(FEATURE_D);
					expect(
						result.notifications.map((notification) => notification.message).join("\n"),
					).toContain(
						"gt get feature-c --downstack --no-restack --no-checkout --force --no-interactive",
					);
				},
			);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"aborts an unsafe in-path fork before merge or Graphite mutation commands",
		async () => {
			await withSandbox(
				{
					currentBranch: FEATURE_B,
					state: {
						topology: [
							{ branch: TRUNK, children: [FEATURE_A], trunk: true },
							{ branch: FEATURE_A, parent: TRUNK, children: [FEATURE_B, FEATURE_C] },
							{ branch: FEATURE_B, parent: FEATURE_A, children: [] },
							{ branch: FEATURE_C, parent: FEATURE_A, children: [] },
						],
					},
				},
				async (sandbox) => {
					const result = await executeSandboxLanding(sandbox);

					expect(result.outcome.type).toBe("failure");
					expect(
						result.notifications.map((notification) => notification.message).join("\n"),
					).toContain("Refusing to land: the stack forks at feature-a.");
					const log = await readCommandLog(sandbox);
					expect(commandArgs(log, "gh", "pr", "merge")).toEqual([]);
					expect(commandArgs(log, "gt", "get")).toEqual([]);
					expect(commandArgs(log, "gt", "delete")).toEqual([]);
					expect(commandArgs(log, "gt", "restack")).toEqual([]);
					expect(commandArgs(log, "gt", "submit")).toEqual([]);

					const branches = await localBranches(sandbox);
					expect(branches).toEqual(
						expect.arrayContaining([FEATURE_A, FEATURE_B, FEATURE_C, FEATURE_D]),
					);
				},
			);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"skips local deletion when the pre-delete topology reread exposes a new child",
		async () => {
			await withSandbox(
				{
					currentBranch: FEATURE_A,
					state: {
						topology: [
							{ branch: TRUNK, children: [FEATURE_A], trunk: true },
							{ branch: FEATURE_A, parent: TRUNK, children: [ROGUE] },
							{ branch: ROGUE, parent: FEATURE_A, children: [] },
						],
					},
				},
				async (sandbox) => {
					const result = await executeSandboxLanding(sandbox, {
						initialShape: singleBranchInitialShape(sandbox),
					});

					expect(result.outcome.type).toBe("success");
					const log = await readCommandLog(sandbox);
					expect(commandArgs(log, "gt", "delete")).toEqual([]);
					const branches = await localBranches(sandbox);
					expect(branches).toContain(FEATURE_A);
					expect(
						result.notifications.map((notification) => notification.message).join("\n"),
					).toContain("Inspect the unexpected children");
				},
			);
		},
		TEST_TIMEOUT_MS,
	);
});

async function executeSandboxLanding(
	sandbox: Sandbox,
	options: { initialShape?: LandingShape } = {},
): Promise<{
	outcome: Awaited<ReturnType<typeof executeStackLanding>>;
	notifications: Notification[];
}> {
	const parsed = parseArgs("--yes");
	expect(parsed.type).toBe("success");
	if (parsed.type !== "success") throw new Error(parsed.failure.message);
	const notifications: Notification[] = [];
	const ctx: LandStackCommandContext = {
		cwd: sandbox.repoRoot,
		hasUI: true,
		ui: {
			notify(message, level) {
				notifications.push({ message, level });
			},
			async confirm() {
				return true;
			},
			setStatus() {},
		},
		async waitForIdle() {},
	};
	const pi: LandStackExtensionAPI = {
		async exec(command, args, execOptions = {}) {
			return await runCommand(command, args, {
				cwd: execOptions.cwd ?? sandbox.repoRoot,
				env: sandbox.env,
				...(execOptions.timeout === undefined ? {} : { timeout: execOptions.timeout }),
			});
		},
	};
	const executionOptions =
		options.initialShape === undefined ? {} : { initialShape: options.initialShape };
	const outcome = await executeStackLanding(pi, ctx, parsed.value, executionOptions);
	return { outcome, notifications };
}

async function withSandbox(
	options: { currentBranch: string; state?: Partial<SandboxState> },
	run: (sandbox: Sandbox) => Promise<void>,
): Promise<void> {
	const tempRoot = await mkdtemp(join(tmpdir(), "sdl-flow-land-sandbox-"));
	const repoRoot = join(tempRoot, "repo");
	const binDir = join(tempRoot, "bin");
	const statePath = join(tempRoot, "state.json");
	const env = {
		...process.env,
		PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
		SDL_SANDBOX_STATE: statePath,
	};

	try {
		await mkdir(repoRoot, { recursive: true });
		await mkdir(binDir, { recursive: true });
		await writeShims(binDir);
		const shas = await initializeGitStack(repoRoot, env, options.currentBranch);
		await writeState(statePath, buildInitialState(shas, options.state));
		await run({ tempRoot, repoRoot, statePath, env, shas });
	} finally {
		await rm(tempRoot, {
			recursive: true,
			force: true,
			maxRetries: TEMP_ROOT_CLEANUP_RETRIES,
			retryDelay: TEMP_ROOT_CLEANUP_RETRY_DELAY_MS,
		});
	}
}

async function initializeGitStack(
	repoRoot: string,
	env: NodeJS.ProcessEnv,
	currentBranch: string,
): Promise<Record<string, string>> {
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["init", "-b", TRUNK] });
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["config", "user.email", "test@example.com"],
	});
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["config", "user.name", "SDL Test"],
	});
	await commitFile(repoRoot, env, "README.md", "initial\n", "initial");
	await createBranchWithCommit(repoRoot, env, FEATURE_A, TRUNK);
	await createBranchWithCommit(repoRoot, env, FEATURE_B, FEATURE_A);
	await createBranchWithCommit(repoRoot, env, FEATURE_C, FEATURE_B);
	await createBranchWithCommit(repoRoot, env, FEATURE_D, FEATURE_B);
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["checkout", currentBranch],
	});
	return {
		[FEATURE_A]: await revParse(repoRoot, env, FEATURE_A),
		[FEATURE_B]: await revParse(repoRoot, env, FEATURE_B),
		[FEATURE_C]: await revParse(repoRoot, env, FEATURE_C),
		[FEATURE_D]: await revParse(repoRoot, env, FEATURE_D),
	};
}

async function createBranchWithCommit(
	repoRoot: string,
	env: NodeJS.ProcessEnv,
	branch: string,
	startPoint: string,
): Promise<void> {
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["checkout", "-b", branch, startPoint],
	});
	await commitFile(repoRoot, env, `${branch}.txt`, `${branch}\n`, branch);
}

async function commitFile(
	repoRoot: string,
	env: NodeJS.ProcessEnv,
	path: string,
	content: string,
	message: string,
): Promise<void> {
	await writeFile(join(repoRoot, path), content);
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["add", path] });
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["commit", "-m", message] });
}

async function revParse(repoRoot: string, env: NodeJS.ProcessEnv, ref: string): Promise<string> {
	const result = await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["rev-parse", ref],
	});
	return result.stdout.trim();
}

function buildInitialState(
	shas: Record<string, string>,
	overrides: Partial<SandboxState> = {},
): SandboxState {
	return {
		prs: overrides.prs ?? {
			[FEATURE_A]: pr(101, FEATURE_A, TRUNK, shas[FEATURE_A] ?? ""),
			[FEATURE_B]: pr(102, FEATURE_B, FEATURE_A, shas[FEATURE_B] ?? ""),
			[FEATURE_C]: pr(103, FEATURE_C, FEATURE_B, shas[FEATURE_C] ?? ""),
			[FEATURE_D]: pr(104, FEATURE_D, FEATURE_B, shas[FEATURE_D] ?? ""),
		},
		topology: overrides.topology ?? [
			{ branch: TRUNK, children: [FEATURE_A], trunk: true },
			{ branch: FEATURE_A, parent: TRUNK, children: [FEATURE_B] },
			{ branch: FEATURE_B, parent: FEATURE_A, children: [FEATURE_C, FEATURE_D] },
			{ branch: FEATURE_C, parent: FEATURE_B, children: [] },
			{ branch: FEATURE_D, parent: FEATURE_B, children: [] },
		],
		commandLog: overrides.commandLog ?? [],
		...(overrides.gtGetFailures === undefined ? {} : { gtGetFailures: overrides.gtGetFailures }),
	};
}

function pr(number: number, branch: string, baseRefName: string, headRefOid: string): SandboxPr {
	return {
		number,
		title: `PR ${number}`,
		body: `Body for PR ${number}`,
		state: "OPEN",
		isDraft: false,
		headRefName: branch,
		baseRefName,
		headRefOid,
		mergeStateStatus: "CLEAN",
		url: `https://example.test/pr/${number}`,
		mergedAt: null,
	};
}

function multiRootInitialShape(sandbox: Sandbox): LandingShape {
	return {
		repoRoot: sandbox.repoRoot,
		current: FEATURE_B,
		trunk: TRUNK,
		metadataDbPath: join(sandbox.repoRoot, ".git", ".graphite_metadata.db"),
		stack: {
			trunk: TRUNK,
			current: FEATURE_B,
			actualCurrentBranch: FEATURE_B,
			landingTargetBranch: FEATURE_B,
			landingBranches: [FEATURE_A, FEATURE_B],
			remainingLandingBranches: [],
			descendantBranches: [FEATURE_C, FEATURE_D],
			descendantRootBranches: [FEATURE_C, FEATURE_D],
			warnings: [],
		},
	};
}

function singleBranchInitialShape(sandbox: Sandbox): LandingShape {
	return {
		repoRoot: sandbox.repoRoot,
		current: FEATURE_A,
		trunk: TRUNK,
		metadataDbPath: join(sandbox.repoRoot, ".git", ".graphite_metadata.db"),
		stack: {
			trunk: TRUNK,
			current: FEATURE_A,
			actualCurrentBranch: FEATURE_A,
			landingTargetBranch: FEATURE_A,
			landingBranches: [FEATURE_A],
			remainingLandingBranches: [],
			descendantBranches: [],
			descendantRootBranches: [],
			warnings: [],
		},
	};
}

async function localBranches(sandbox: Sandbox): Promise<string[]> {
	const result = await runRequiredCommand({
		cwd: sandbox.repoRoot,
		env: sandbox.env,
		command: "git",
		args: ["branch", "--format=%(refname:short)"],
	});
	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.sort();
}

function commandArgs(
	log: readonly SandboxCommandLogEntry[],
	command: string,
	...prefix: string[]
): string[][] {
	return log
		.filter(
			(entry) =>
				entry.command === command && prefix.every((part, index) => entry.args[index] === part),
		)
		.map((entry) => entry.args);
}

function commandIndex(
	log: readonly SandboxCommandLogEntry[],
	command: string,
	prefix: readonly string[],
): number {
	return log.findIndex(
		(entry) =>
			entry.command === command && prefix.every((part, index) => entry.args[index] === part),
	);
}

async function readCommandLog(sandbox: Sandbox): Promise<SandboxCommandLogEntry[]> {
	return (await readState(sandbox.statePath)).commandLog;
}

async function readState(statePath: string): Promise<SandboxState> {
	return JSON.parse(await readFile(statePath, "utf8")) as SandboxState;
}

async function writeState(statePath: string, state: SandboxState): Promise<void> {
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function writeShims(binDir: string): Promise<void> {
	const shim = `#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const { basename } = require("node:path");
const { spawnSync } = require("node:child_process");

const statePath = process.env.SDL_SANDBOX_STATE;
if (!statePath) {
  console.error("SDL_SANDBOX_STATE is required");
  process.exit(2);
}
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
const state = JSON.parse(readFileSync(statePath, "utf8"));
state.commandLog = state.commandLog || [];
state.commandLog.push({ command, args });

function save() {
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\\n");
}
function finish(code, stdout = "", stderr = "") {
  save();
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(code);
}
function git(gitArgs) {
  return spawnSync("git", gitArgs, { cwd: process.cwd(), encoding: "utf8" });
}
function currentBranch() {
  const result = git(["symbolic-ref", "--short", "HEAD"]);
  return result.status === 0 ? result.stdout.trim() : "";
}
function branchSha(branch) {
  const result = git(["rev-parse", branch]);
  return result.status === 0 ? result.stdout.trim() : "";
}
function prByBranchOrNumber(value) {
  return Object.values(state.prs || {}).find((pr) => pr.headRefName === value || String(pr.number) === value);
}
function metadataRows() {
  return (state.topology || []).map((row) => ({
    branch_name: row.branch,
    parent_branch_name: row.parent || null,
    children: row.children ? JSON.stringify(row.children) : null,
    validation_result: row.trunk ? "TRUNK" : "VALID",
  }));
}

if (command === "sdl") {
  if (args[0] === "flow" && args[1] === "exec" && args[2] === "read-graphite-branch-metadata") {
    finish(0, JSON.stringify(metadataRows()) + "\\n");
  }
  finish(1, "", "unexpected sdl command: " + args.join(" ") + "\\n");
}

if (command === "gh") {
  if (args[0] === "pr" && args[1] === "view") {
    const pr = prByBranchOrNumber(args[2]);
    if (!pr) finish(1, "", "no such PR: " + args[2] + "\\n");
    finish(0, JSON.stringify(pr) + "\\n");
  }
  if (args[0] === "pr" && args[1] === "merge") {
    const pr = prByBranchOrNumber(args[2]);
    if (!pr) finish(1, "", "no such PR: " + args[2] + "\\n");
    const matchIndex = args.indexOf("--match-head-commit");
    if (matchIndex >= 0 && args[matchIndex + 1] !== pr.headRefOid) {
      finish(1, "", "head commit mismatch\\n");
    }
    pr.state = "MERGED";
    pr.mergedAt = "2026-07-02T00:00:00Z";
    finish(0, "");
  }
  finish(1, "", "unexpected gh command: " + args.join(" ") + "\\n");
}

if (command === "gt") {
  if (args[0] === "trunk") finish(0, "main\\n");
  if (args[0] === "get") {
    const branch = args[1];
    const failure = state.gtGetFailures && state.gtGetFailures[branch];
    if (failure) finish(failure.code || 1, "", failure.stderr || "gt get failed\\n");
    finish(0, "");
  }
  if (args[0] === "delete") {
    const branch = args[1];
    if (currentBranch() === branch) {
      finish(1, "", "fatal: '" + branch + "' is already checked out at '" + process.cwd() + "'\\n");
    }
    const result = git(["branch", "-D", branch]);
    finish(result.status || 0, result.stdout || "", result.stderr || "");
  }
  if (args[0] === "restack") finish(0, "");
  if (args[0] === "submit") {
    const branch = args[args.indexOf("--branch") + 1];
    const pr = prByBranchOrNumber(branch);
    if (!pr) finish(1, "", "no such PR for branch: " + branch + "\\n");
    pr.baseRefName = "main";
    pr.headRefOid = branchSha(branch) || pr.headRefOid;
    finish(0, "");
  }
  finish(1, "", "unexpected gt command: " + args.join(" ") + "\\n");
}

finish(1, "", "unexpected shim command: " + command + "\\n");
`;
	for (const command of ["gh", "gt", "sdl"]) {
		const path = join(binDir, command);
		await writeFile(path, shim);
		await chmod(path, 0o755);
	}
}

interface RunRequiredCommandOptions {
	cwd: string;
	env: NodeJS.ProcessEnv;
	command: string;
	args: readonly string[];
}

async function runRequiredCommand(options: RunRequiredCommandOptions): Promise<ExecResult> {
	const result = await runCommand(options.command, options.args, {
		cwd: options.cwd,
		env: options.env,
		timeout: COMMAND_TIMEOUT_MS,
	});
	if (result.code === 0 && !result.killed) return result;
	throw new Error(
		formatCommandResultFailure(
			"Command failed while preparing land-stack sandbox fixture",
			options.command,
			options.args,
			result,
		),
	);
}
