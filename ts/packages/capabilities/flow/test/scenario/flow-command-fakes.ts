import { join } from "node:path";

import { flowAutobranchCommand } from "../../src/commands/autobranch.ts";
import { flowAutoslotCommand } from "../../src/commands/autoslot.ts";
import { flowBranchLatestCommitCommand } from "../../src/commands/branch-latest-commit.ts";
import { flowChangesCommand } from "../../src/commands/changes.ts";
import { flowExecReadGraphiteBranchMetadataCommand } from "../../src/commands/exec-read-graphite-branch-metadata.ts";
import { flowCpCommand } from "../../src/commands/cp.ts";
import { flowPullTrunkCommand } from "../../src/commands/pull-trunk.ts";
import { flowPushCommand } from "../../src/commands/push.ts";
import { flowRegeneratePrCommand } from "../../src/commands/regenerate-pr.ts";
import { flowSubmitCommand } from "../../src/commands/submit.ts";
import type { SdlCommand, SdlExtensionApi, SdlResult } from "sdl-sdk";
import { failed } from "sdl-sdk";

import {
	ScriptedSdlTestContext,
	type RunWithFakesDefaults,
	type ScriptedExecResponse,
	type TestState,
} from "./sdl-cli-fakes.ts";

interface RunFlowCommandWithFakesOptions {
	request?: unknown;
	state?: TestState;
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
	defaults?: RunWithFakesDefaults;
}

interface FlowCommandFixture {
	command: SdlCommand;
	request: unknown;
	defaults: RunWithFakesDefaults;
	options: RunFlowCommandWithFakesOptions;
}

export function runFlowCpCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowCpCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: dirtyCpExecResponses,
			textGenerationResults: () => [{ ok: true, text: defaultCpMessage() }],
		},
	});
}

export function runFlowPushCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowPushCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [
				{ match: "git status --porcelain", result: { stdout: "" } },
				{ match: "git push", result: { stdout: "Everything up-to-date\n" } },
			],
			textGenerationResults: () => [],
		},
	});
}

export function runFlowPullTrunkCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowPullTrunkCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [
				{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
				{
					match: "git worktree list --porcelain",
					result: { stdout: "worktree /work\nHEAD abc123\nbranch refs/heads/feature\n" },
				},
				{
					match: "git fetch origin refs/heads/main:refs/heads/main",
					result: { stdout: "updated\n" },
				},
			],
			textGenerationResults: () => [],
		},
	});
}

export function runFlowBranchLatestCommitCommandWithFakes(
	options: RunFlowCommandWithFakesOptions = {},
) {
	return runFlowCommandWithFakes({
		command: flowBranchLatestCommitCommand,
		request: options.request ?? { slug: "demo-branch" },
		options,
		defaults: options.defaults ?? {
			execResponses: branchLatestCommitHappyExec,
			textGenerationResults: () => [],
		},
	});
}

export function runFlowExecReadGraphiteBranchMetadataCommandWithFakes(
	options: RunFlowCommandWithFakesOptions = {},
) {
	return runFlowCommandWithFakes({
		command: flowExecReadGraphiteBranchMetadataCommand,
		request: options.request ?? { dbPath: "/work/.git/.graphite_metadata.db" },
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

interface BranchLatestCommitExecOptions {
	targetBranchName?: string;
	targetAvailability?: readonly ScriptedExecResponse[];
	backupCreateResult?: ScriptedExecResponse["result"];
	backupDeleteResult?: ScriptedExecResponse["result"];
}

function availableBranchResponses(branchName: string): ScriptedExecResponse[] {
	const segments = branchName.split("/");
	const parentResponses = segments.slice(1).map((_, index) => ({
		match: `git show-ref --verify --quiet refs/heads/${segments.slice(0, index + 1).join("/")}`,
		result: { code: 1 },
	}));
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: { code: 1 } },
		...parentResponses,
		{ match: `git for-each-ref --format=%(refname) refs/heads/${branchName}/`, result: {} },
	];
}

function exactExistingBranchResponse(branchName: string): ScriptedExecResponse[] {
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git show-ref --verify --quiet refs/heads/${branchName}`, result: {} },
	];
}

// Subprocess script for `sdl flow branch-latest-commit` with an explicit `slug: "demo-branch"` (which
// skips model slug generation) on source branch `feature`, up to and including the source-branch reset
// — the prefix shared by the success and Graphite-create-failure paths. The scripted fake consumes
// each response once, so duplicated commands (status/upstream/show-current/rev-parse) list one entry
// per call; the timestamped recovery-branch commands match by regex.
function branchLatestCommitExecThroughSourceReset(
	options: BranchLatestCommitExecOptions = {},
): ScriptedExecResponse[] {
	return [
		// Load the pending-worktree snapshot (clean).
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
		// Preparation: upstream HEAD check (no upstream → eligible).
		{ match: "git branch --show-current", result: { stdout: "feature\n" } },
		{
			match: "git for-each-ref --format=%(upstream:short) refs/heads/feature",
			result: { stdout: "" },
		},
		// Preparation: no Graphite children, single-parent commit, commit evidence.
		{ match: "gt children --no-interactive", result: { stdout: "" } },
		{ match: "git rev-list --parents -n 1 HEAD", result: { stdout: "abc123 parent456\n" } },
		{ match: "git log -1 --format=%B", result: { stdout: "Add demo feature\n" } },
		{ match: "git diff HEAD^ HEAD --no-ext-diff", result: { stdout: "diff --git a/x b/x\n" } },
		// Preparation: branch name availability for the requested slug.
		...(options.targetAvailability ?? availableBranchResponses("demo-branch")),
		// Transaction: upstream recheck before mutation.
		{ match: "git branch --show-current", result: { stdout: "feature\n" } },
		{
			match: "git for-each-ref --format=%(upstream:short) refs/heads/feature",
			result: { stdout: "" },
		},
		// Transaction: recovery (backup) branch availability.
		{ match: /^git check-ref-format --branch autobranch-backup\/feature\/\d+$/, result: {} },
		{
			match: /^git show-ref --verify --quiet refs\/heads\/autobranch-backup\/feature\/\d+$/,
			result: { code: 1 },
		},
		{ match: "git show-ref --verify --quiet refs/heads/autobranch-backup", result: { code: 1 } },
		{
			match: "git show-ref --verify --quiet refs/heads/autobranch-backup/feature",
			result: { code: 1 },
		},
		{
			match:
				/^git for-each-ref --format=%\(refname\) refs\/heads\/autobranch-backup\/feature\/\d+\/$/,
			result: { stdout: "" },
		},
		// Transaction: create recovery branch, reset source to parent.
		{
			match: /^git branch autobranch-backup\/feature\/\d+ abc123$/,
			result: options.backupCreateResult ?? {},
		},
		{ match: "git branch --show-current", result: { stdout: "feature\n" } },
		{ match: "git rev-parse HEAD", result: { stdout: "abc123\n" } },
		{ match: "git reset --hard parent456", result: {} },
	];
}

function branchLatestCommitHappyExec(
	options: BranchLatestCommitExecOptions = {},
): ScriptedExecResponse[] {
	const targetBranchName = options.targetBranchName ?? "demo-branch";
	return [
		...branchLatestCommitExecThroughSourceReset(options),
		// Transaction: create the Graphite branch, move it to the original commit, verify HEAD.
		{
			match: `gt create ${targetBranchName} --no-interactive --no-ai`,
			result: { stdout: "created\n" },
		},
		{ match: "git reset --hard abc123", result: {} },
		{ match: "git rev-parse HEAD", result: { stdout: "abc123\n" } },
		// Transaction: delete the recovery branch.
		{
			match: /^git branch -D autobranch-backup\/feature\/\d+$/,
			result: options.backupDeleteResult ?? {},
		},
		// Final worktree cleanliness check.
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
	];
}

export function branchLatestCommitSuffixedExec(): ScriptedExecResponse[] {
	return branchLatestCommitHappyExec({
		targetBranchName: "demo-branch-2",
		targetAvailability: [
			...exactExistingBranchResponse("demo-branch"),
			...availableBranchResponses("demo-branch-2"),
		],
	});
}

export function branchLatestCommitBackupCreateFailExec(): ScriptedExecResponse[] {
	return branchLatestCommitExecThroughSourceReset({
		backupCreateResult: { code: 128, stderr: "fatal: cannot lock ref\n" },
	});
}

export function branchLatestCommitBackupCleanupWarningExec(): ScriptedExecResponse[] {
	return branchLatestCommitHappyExec({
		backupDeleteResult: { code: 1, stderr: "delete failed\n" },
	});
}

// The Graphite-create step fails after the source branch was reset, so the transaction restores the
// source branch and deletes the partially-created branch before reporting recovery guidance.
export function branchLatestCommitGtCreateFailExec(): ScriptedExecResponse[] {
	return [
		...branchLatestCommitExecThroughSourceReset(),
		{
			match: "gt create demo-branch --no-interactive --no-ai",
			result: { code: 1, stderr: "gt create failed\n" },
		},
		{ match: "git checkout feature", result: {} },
		{ match: "git reset --hard abc123", result: {} },
		{ match: "git branch -D demo-branch", result: {} },
	];
}

const AUTOBRANCH_CHECKPOINT_MESSAGE = "[cp] Move pending work\n\n- Preserve current changes";

export function runFlowAutobranchCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowAutobranchCommand,
		request: options.request ?? { slug: "move-work" },
		options,
		defaults: options.defaults ?? {
			execResponses: autobranchDirtyHappyExec,
			textGenerationResults: () => [{ ok: true, text: AUTOBRANCH_CHECKPOINT_MESSAGE }],
			missingTextGenerationResult: () => ({ ok: true, text: AUTOBRANCH_CHECKPOINT_MESSAGE }),
		},
	});
}

// Subprocess script for `sdl flow autobranch --slug move-work` on a DIRTY source branch `feature/source`,
// up to and including the stash list — the prefix shared by the success and Graphite-create-failure
// paths. The transaction stamps the stash message with `Date.now()`, so the test must pin the clock
// (e.g. `vi.setSystemTime(new Date(123456789))`) for the regex/stash-list subject to line up.
function autobranchDirtyExecThroughStashList(): ScriptedExecResponse[] {
	return [
		// Load the pending-worktree snapshot (dirty).
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" },
		},
		// Preparation: branch name availability for the requested slug.
		{ match: "git check-ref-format --branch move-work", result: {} },
		{ match: "git show-ref --verify --quiet refs/heads/move-work", result: { code: 1 } },
		{ match: "git for-each-ref --format=%(refname) refs/heads/move-work/", result: { stdout: "" } },
		// Transaction: stash pending changes, then locate the new stash entry by its message.
		{
			match: /^git stash push --include-untracked -m pi-autobranch:\d+:move-work$/,
			result: {},
		},
		{
			match: "git stash list --format=%gd%x00%s",
			result: { stdout: "stash@{0}\0On feature/source: pi-autobranch:123456789:move-work\n" },
		},
	];
}

function autobranchDirtyHappyExec(): ScriptedExecResponse[] {
	return [
		...autobranchDirtyExecThroughStashList(),
		// Transaction: create the Graphite branch, restore the stash, commit the checkpoint.
		{ match: "gt create move-work --no-interactive --no-ai", result: {} },
		{ match: "git stash pop stash@{0}", result: {} },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc1234 [cp] Move pending work\n" } },
		// Final worktree cleanliness check.
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
	];
}

// The Graphite-create step fails after the pending changes were stashed, so the transaction restores
// the stash to the original branch before reporting recovery guidance.
export function autobranchGtCreateFailExec(): ScriptedExecResponse[] {
	return [
		...autobranchDirtyExecThroughStashList(),
		{
			match: "gt create move-work --no-interactive --no-ai",
			result: { code: 1, stderr: "fatal: cannot lock ref\n" },
		},
		{ match: "git stash pop stash@{0}", result: {} },
	];
}

// A clean worktree whose source branch still has Graphite children: the latest-commit eligibility
// guardrail declines before any mutation, so the flow returns an `outcome: "refusal"` result.
export function branchLatestCommitChildBranchRefusalExec(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
		{ match: "git branch --show-current", result: { stdout: "feature\n" } },
		{
			match: "git for-each-ref --format=%(upstream:short) refs/heads/feature",
			result: { stdout: "" },
		},
		{ match: "gt children --no-interactive", result: { stdout: "child-a\nchild-b\n" } },
	];
}

// `sdl flow autoslot` wraps the CCC autobranch + slot-checkout orchestration through `runFlowCccCli`.
// The happy path moves a managed slot via a real `SlotClient` (filesystem/git side effects), which is
// out of the default fake lane — domain happy-path coverage lives in `packages/ccc/test/autoslot.test.ts`.
// These flow scenarios exercise the wrapper end-to-end on the outcomes that settle BEFORE slot
// checkout: caps resolution, CCC house-style rendering, and stdout/stderr routing via `runFlowCccCli`.
export function runFlowAutoslotCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowAutoslotCommand,
		request: options.request ?? { slug: "move-work" },
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

// Snapshot probe failure: `git status` fails while loading the pending-worktree snapshot, so the
// autobranch step fails before any branch is created or slot checkout is attempted.
export function autoslotStatusProbeFailExec(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/source\n" } },
		{
			match: "git status --porcelain=v1",
			result: { code: 1, stderr: "fatal: status failed\n" },
		},
	];
}

export function runFlowChangesCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowChangesCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: dirtyChangesExecResponses,
			textGenerationResults: () => [
				{ ok: true, text: "- Update app behavior\n- Add notes for reviewers" },
			],
		},
	});
}

export function runFlowRegeneratePrCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowRegeneratePrCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

export function runFlowSubmitCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowSubmitCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

function runFlowCommandWithFakes(fixture: FlowCommandFixture) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const cwd = fixture.options.cwd ?? "/work";
	const homeDir = fixture.options.homeDir ?? join(cwd, ".home");
	const context = new ScriptedSdlTestContext(fixture.options.state, {
		cwd,
		env: { HOME: homeDir, ...(fixture.options.env ?? {}) },
		execResponses: fixture.defaults.execResponses,
		textGenerationResults: fixture.defaults.textGenerationResults,
		...(fixture.defaults.missingTextGenerationResult === undefined
			? {}
			: { missingTextGenerationResult: fixture.defaults.missingTextGenerationResult }),
	});
	context.stdout = (text) => {
		stdout.push(text);
	};
	context.stderr = (text) => {
		stderr.push(text);
	};
	context.onOutput = (stream, text) => {
		liveOutput.push({ stream, text });
	};
	return {
		context,
		stdout,
		stderr,
		liveOutput,
		exit: runFlowCommand({
			context,
			command: fixture.command,
			request: fixture.request,
			stdout: context.stdout,
			stderr: context.stderr,
		}),
	};
}

async function runFlowCommand(input: {
	context: SdlExtensionApi;
	command: SdlCommand;
	request: unknown;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const parsedRequest = input.command.schema?.safeParse(input.request) ?? {
		success: true,
		data: {},
	};
	if (!parsedRequest.success) {
		const issue = parsedRequest.error.issues[0]?.message ?? "request did not match command schema";
		const result = failed(`Invalid request for command ${input.command.name}: ${issue}`, 2);
		writeSdlResultOutput(result, input);
		return 2;
	}
	const result = await input.command.run(input.context, parsedRequest.data);
	if (!isSdlResult(result)) {
		throw new Error(`Flow test command ${input.command.name} returned a rendered result.`);
	}
	writeSdlResultOutput(result, input);
	return result.ok ? 0 : result.exitCode;
}

function isSdlResult(result: unknown): result is SdlResult {
	return typeof result === "object" && result !== null && "ok" in result;
}

function writeSdlResultOutput(
	result: SdlResult,
	deps: { stdout: (text: string) => void; stderr: (text: string) => void },
): void {
	if (result.message === "") return;
	const output = `${result.message}\n`;
	if (result.ok) {
		deps.stdout(output);
		return;
	}
	deps.stderr(output);
}

function dirtyChangesExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
	];
}

function dirtyCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
	];
}

function defaultCpMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}
