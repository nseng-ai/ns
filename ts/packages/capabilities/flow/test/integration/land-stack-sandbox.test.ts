/**
 * End-to-end integration tests for `executeStackLanding` — the engine behind
 * `flow land`'s stack-landing path — run against a real git repository with the
 * external tools it shells out to (`gh`, `gt`, `ns`) replaced by executable
 * Node shims placed first on PATH. The shims simulate each tool's documented
 * contract (PR views/merges, Graphite topology metadata, deletes that actually
 * run `git branch -D`) and append every invocation to a shared JSON state file
 * that tests read back as a command log. This exercises the real seams —
 * subprocess spawning, argument construction, exit codes, stdout parsing, and
 * genuine ref mutation — that in-memory gateway fakes cannot, while staying
 * hermetic (no network, no real GitHub or Graphite).
 *
 * Landing a stack is destructive (irreversible squash merges plus local branch
 * deletion), so every test here is a safety assertion:
 * - The happy path merges bottom-up with `--match-head-commit` pinned to real
 *   SHAs, deletes only the landed branches, preserves multi-root descendants,
 *   and honors the crash-safe ordering merge → get → delete → restack → submit.
 * - A failed optional descendant refresh degrades to advice: remaining roots
 *   are still attempted, nothing is deleted or restacked as a consequence.
 * - An in-path fork aborts before the first mutation — zero merge/get/delete/
 *   restack/submit commands issued.
 * - The pre-delete topology reread is consulted for real: a concurrently
 *   appearing child skips local deletion entirely (TOCTOU protection).
 *
 * Boundary: the shims encode the tools' contracts, so this suite validates
 * ns's orchestration against those contracts; drift in real `gt`/`gh`
 * behavior is covered by land-stack-graphite-cli.test.ts instead.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCommand } from "@ns/core/exec";
import { optionalEntry } from "@ns/core/primitives";
import { executeStackLanding, parseArgs } from "../../src/land/land-stack.ts";
import type {
	LandStackCommandContext,
	LandStackExtensionAPI,
	NotifyLevel,
} from "../../src/land/stack/types.ts";
import { createRequiredCommandRunner } from "./support/run-required-command.ts";

const TEST_TIMEOUT_MS = 120_000;
const TEMP_ROOT_CLEANUP_RETRIES = 5;
const TEMP_ROOT_CLEANUP_RETRY_DELAY_MS = 100;

const TRUNK = "main";
const FEATURE_A = "feature-a";
const FEATURE_B = "feature-b";
const FEATURE_C = "feature-c";
const FEATURE_D = "feature-d";
const ROGUE = "rogue-branch";

const runRequiredCommand = createRequiredCommandRunner({
	failureContext: "Command failed while preparing land-stack sandbox fixture",
});

const SANDBOX_PR_ROWS = [
	{ number: 101, branch: FEATURE_A, baseRefName: TRUNK },
	{ number: 102, branch: FEATURE_B, baseRefName: FEATURE_A },
	{ number: 103, branch: FEATURE_C, baseRefName: FEATURE_B },
	{ number: 104, branch: FEATURE_D, baseRefName: FEATURE_B },
] as const;

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

interface SandboxPrOptions {
	readonly number: number;
	readonly branch: string;
	readonly baseRefName: string;
	readonly headRefOid: string;
}

interface SandboxTopologyRow {
	branch: string;
	parent?: string;
	children?: string[];
	isTrunk?: boolean;
}

interface SandboxCommandLogEntry {
	command: string;
	args: string[];
}

interface SandboxState {
	prs: Record<string, SandboxPr>;
	topology: SandboxTopologyRow[];
	topologyReads?: SandboxTopologyRow[][];
	commandLog: SandboxCommandLogEntry[];
	gtGetFailures?: Record<string, { code: number; stderr: string }>;
	gtRestackFailures?: Record<string, { code: number; stderr: string }>;
	canDeleteCurrentBranch?: boolean;
}

interface Sandbox {
	tempRoot: string;
	git: GitFixture;
	statePath: string;
	shas: Record<string, string>;
}

interface GitFixture {
	repoRoot: string;
	env: NodeJS.ProcessEnv;
}

interface CreateBranchWithCommitOptions {
	readonly git: GitFixture;
	readonly branch: string;
	readonly startPoint: string;
}

interface CommitFileOptions {
	readonly git: GitFixture;
	readonly path: string;
	readonly content: string;
	readonly message: string;
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
				const result = await executeSandboxLanding(sandbox);

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
					const result = await executeSandboxLanding(sandbox);

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
					expect(notificationText(result)).toContain(
						"gt get feature-c --downstack --no-restack --no-checkout --force --no-interactive",
					);
				},
			);
		},
		TEST_TIMEOUT_MS,
	);

	test(
		"continues later optional descendant roots after one post-delete restack warning",
		async () => {
			await withSandbox(
				{
					currentBranch: FEATURE_B,
					state: {
						canDeleteCurrentBranch: true,
						gtRestackFailures: {
							[FEATURE_C]: { code: 1, stderr: "restack failed\n" },
						},
					},
				},
				async (sandbox) => {
					const result = await executeSandboxLanding(sandbox);

					expect(result.outcome.type).toBe("success");
					const log = await readCommandLog(sandbox);
					const featureCRestack = commandIndex(log, "gt", ["restack", "--branch", FEATURE_C]);
					const featureDRestack = commandIndex(log, "gt", ["restack", "--branch", FEATURE_D]);
					expect(featureCRestack).toBeGreaterThanOrEqual(0);
					expect(featureDRestack).toBeGreaterThan(featureCRestack);
					expect(commandIndex(log, "gt", ["submit", "--branch", FEATURE_C])).toBe(-1);
					expect(commandIndex(log, "gt", ["submit", "--branch", FEATURE_D])).toBeGreaterThan(
						featureDRestack,
					);
					expect(commandArgs(log, "gt", "delete").map((args) => args[1])).toContain(FEATURE_B);

					const messages = notificationText(result);
					expect(messages).toContain(FEATURE_C);
					expect(messages).not.toContain(`descendant branch ${FEATURE_D} was left`);

					const branches = await localBranches(sandbox);
					expect(branches).not.toContain(FEATURE_B);
					expect(branches).toContain(FEATURE_C);
					expect(branches).toContain(FEATURE_D);
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
							{ branch: TRUNK, children: [FEATURE_A], isTrunk: true },
							{ branch: FEATURE_A, parent: TRUNK, children: [FEATURE_B, FEATURE_C] },
							{ branch: FEATURE_B, parent: FEATURE_A, children: [] },
							{ branch: FEATURE_C, parent: FEATURE_A, children: [] },
						],
					},
				},
				async (sandbox) => {
					const result = await executeSandboxLanding(sandbox);

					expect(result.outcome.type).toBe("failure");
					expect(notificationText(result)).toContain(
						"Refusing to land: the stack forks at feature-a.",
					);
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
							{ branch: TRUNK, children: [FEATURE_A], isTrunk: true },
							{ branch: FEATURE_A, parent: TRUNK, children: [ROGUE] },
							{ branch: ROGUE, parent: FEATURE_A, children: [] },
						],
						topologyReads: [
							[
								{ branch: TRUNK, children: [FEATURE_A], isTrunk: true },
								{ branch: FEATURE_A, parent: TRUNK, children: [] },
							],
						],
					},
				},
				async (sandbox) => {
					const result = await executeSandboxLanding(sandbox);

					expect(result.outcome.type).toBe("success");
					const log = await readCommandLog(sandbox);
					expect(commandArgs(log, "gt", "delete")).toEqual([]);
					const branches = await localBranches(sandbox);
					expect(branches).toContain(FEATURE_A);
					expect(notificationText(result)).toContain("Inspect the unexpected children");
				},
			);
		},
		TEST_TIMEOUT_MS,
	);
});

async function executeSandboxLanding(sandbox: Sandbox): Promise<{
	outcome: Awaited<ReturnType<typeof executeStackLanding>>;
	notifications: Notification[];
}> {
	const parsed = parseArgs("--yes");
	expect(parsed.type).toBe("success");
	if (parsed.type !== "success") throw new Error(parsed.failure.message);
	const notifications: Notification[] = [];
	const ctx: LandStackCommandContext = {
		cwd: sandbox.git.repoRoot,
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
				cwd: execOptions.cwd ?? sandbox.git.repoRoot,
				env: sandbox.git.env,
				...(execOptions.timeout === undefined ? {} : { timeout: execOptions.timeout }),
			});
		},
	};
	const outcome = await executeStackLanding(pi, ctx, parsed.value);
	return { outcome, notifications };
}

function notificationText(result: { readonly notifications: readonly Notification[] }): string {
	return result.notifications.map((notification) => notification.message).join("\n");
}

async function withSandbox(
	options: { currentBranch: string; state?: Partial<SandboxState> },
	run: (sandbox: Sandbox) => Promise<void>,
): Promise<void> {
	const tempRoot = await mkdtemp(join(tmpdir(), "ns-flow-land-sandbox-"));
	const repoRoot = join(tempRoot, "repo");
	const binDir = join(tempRoot, "bin");
	const statePath = join(tempRoot, "state.json");
	const env = {
		...process.env,
		PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
		NS_SANDBOX_STATE: statePath,
	};

	try {
		await mkdir(repoRoot, { recursive: true });
		await mkdir(binDir, { recursive: true });
		await writeShims(binDir);
		const git = { repoRoot, env } satisfies GitFixture;
		const shas = await initializeGitStack(git, options.currentBranch);
		await writeState(statePath, buildInitialState(shas, options.state));
		await run({ tempRoot, git, statePath, shas });
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
	git: GitFixture,
	currentBranch: string,
): Promise<Record<string, string>> {
	await runRequiredCommand({
		cwd: git.repoRoot,
		env: git.env,
		command: "git",
		args: ["init", "-b", TRUNK],
	});
	await runRequiredCommand({
		cwd: git.repoRoot,
		env: git.env,
		command: "git",
		args: ["config", "user.email", "test@example.com"],
	});
	await runRequiredCommand({
		cwd: git.repoRoot,
		env: git.env,
		command: "git",
		args: ["config", "user.name", "ns Test"],
	});
	await commitFile({ git, path: "README.md", content: "initial\n", message: "initial" });
	await createBranchWithCommit({ git, branch: FEATURE_A, startPoint: TRUNK });
	await createBranchWithCommit({ git, branch: FEATURE_B, startPoint: FEATURE_A });
	await createBranchWithCommit({ git, branch: FEATURE_C, startPoint: FEATURE_B });
	await createBranchWithCommit({ git, branch: FEATURE_D, startPoint: FEATURE_B });
	await runRequiredCommand({
		cwd: git.repoRoot,
		env: git.env,
		command: "git",
		args: ["checkout", currentBranch],
	});
	return {
		[FEATURE_A]: await revParse(git, FEATURE_A),
		[FEATURE_B]: await revParse(git, FEATURE_B),
		[FEATURE_C]: await revParse(git, FEATURE_C),
		[FEATURE_D]: await revParse(git, FEATURE_D),
	};
}

async function createBranchWithCommit(options: CreateBranchWithCommitOptions): Promise<void> {
	await runRequiredCommand({
		cwd: options.git.repoRoot,
		env: options.git.env,
		command: "git",
		args: ["checkout", "-b", options.branch, options.startPoint],
	});
	await commitFile({
		git: options.git,
		path: `${options.branch}.txt`,
		content: `${options.branch}\n`,
		message: options.branch,
	});
}

async function commitFile(options: CommitFileOptions): Promise<void> {
	await writeFile(join(options.git.repoRoot, options.path), options.content);
	await runRequiredCommand({
		cwd: options.git.repoRoot,
		env: options.git.env,
		command: "git",
		args: ["add", options.path],
	});
	await runRequiredCommand({
		cwd: options.git.repoRoot,
		env: options.git.env,
		command: "git",
		args: ["commit", "-m", options.message],
	});
}

async function revParse(git: GitFixture, ref: string): Promise<string> {
	const result = await runRequiredCommand({
		cwd: git.repoRoot,
		env: git.env,
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
		prs: overrides.prs ?? buildDefaultPrs(shas),
		topology: overrides.topology ?? [
			{ branch: TRUNK, children: [FEATURE_A], isTrunk: true },
			{ branch: FEATURE_A, parent: TRUNK, children: [FEATURE_B] },
			{ branch: FEATURE_B, parent: FEATURE_A, children: [FEATURE_C, FEATURE_D] },
			{ branch: FEATURE_C, parent: FEATURE_B, children: [] },
			{ branch: FEATURE_D, parent: FEATURE_B, children: [] },
		],
		commandLog: overrides.commandLog ?? [],
		...optionalEntry("topologyReads", overrides.topologyReads),
		...optionalEntry("gtGetFailures", overrides.gtGetFailures),
		...optionalEntry("gtRestackFailures", overrides.gtRestackFailures),
		...optionalEntry("canDeleteCurrentBranch", overrides.canDeleteCurrentBranch),
	};
}

function buildDefaultPrs(shas: Record<string, string>): Record<string, SandboxPr> {
	const prs: Record<string, SandboxPr> = {};
	for (const row of SANDBOX_PR_ROWS) {
		prs[row.branch] = pr({
			number: row.number,
			branch: row.branch,
			baseRefName: row.baseRefName,
			headRefOid: shas[row.branch] ?? "",
		});
	}
	return prs;
}

function pr(options: SandboxPrOptions): SandboxPr {
	return {
		number: options.number,
		title: `PR ${options.number}`,
		body: `Body for PR ${options.number}`,
		state: "OPEN",
		isDraft: false,
		headRefName: options.branch,
		baseRefName: options.baseRefName,
		headRefOid: options.headRefOid,
		mergeStateStatus: "CLEAN",
		url: `https://example.test/pr/${options.number}`,
		mergedAt: null,
	};
}

async function localBranches(sandbox: Sandbox): Promise<string[]> {
	const result = await runRequiredCommand({
		cwd: sandbox.git.repoRoot,
		env: sandbox.git.env,
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
	return log.filter((entry) => matchesCommand(entry, command, prefix)).map((entry) => entry.args);
}

function commandIndex(
	log: readonly SandboxCommandLogEntry[],
	command: string,
	prefix: readonly string[],
): number {
	return log.findIndex((entry) => matchesCommand(entry, command, prefix));
}

function matchesCommand(
	entry: SandboxCommandLogEntry,
	command: string,
	prefix: readonly string[],
): boolean {
	return entry.command === command && prefix.every((part, index) => entry.args[index] === part);
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

const statePath = process.env.NS_SANDBOX_STATE;
if (!statePath) {
  console.error("NS_SANDBOX_STATE is required");
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
  const scriptedTopologies = state.topologyReads || [];
  const topology = scriptedTopologies.length > 0 ? scriptedTopologies.shift() : (state.topology || []);
  state.topologyReads = scriptedTopologies;
  return topology.map((row) => ({
    branch_name: row.branch,
    parent_branch_name: row.parent || null,
    children: row.children ? JSON.stringify(row.children) : null,
    validation_result: row.isTrunk ? "TRUNK" : "VALID",
  }));
}

if (command === "ns") {
  if (args[0] === "flow" && args[1] === "exec" && args[2] === "read-graphite-branch-metadata") {
    finish(0, JSON.stringify(metadataRows()) + "\\n");
  }
  finish(1, "", "unexpected ns command: " + args.join(" ") + "\\n");
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
    if (failure) finish(failure.code ?? 1, "", failure.stderr ?? "gt get failed\\n");
    finish(0, "");
  }
  if (args[0] === "delete") {
    const branch = args[1];
    if (currentBranch() === branch) {
      if (!state.canDeleteCurrentBranch) {
        finish(1, "", "fatal: '" + branch + "' is already checked out at '" + process.cwd() + "'\\n");
      }
      git(["checkout", "main"]);
    }
    const result = git(["branch", "-D", branch]);
    finish(result.status || 0, result.stdout || "", result.stderr || "");
  }
  if (args[0] === "restack") {
    const branch = args[args.indexOf("--branch") + 1];
    const failure = state.gtRestackFailures && state.gtRestackFailures[branch];
    if (failure) finish(failure.code ?? 1, "", failure.stderr ?? "gt restack failed\\n");
    finish(0, "");
  }
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
	for (const command of ["gh", "gt", "ns"]) {
		const path = join(binDir, command);
		await writeFile(path, shim);
		await chmod(path, 0o755);
	}
}
