import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

import { flowAutobranchCommand } from "../../src/ns/commands/autobranch.ts";
import { flowAutoslotCommand } from "../../src/ns/commands/autoslot.ts";
import { flowBranchLatestCommitCommand } from "../../src/ns/commands/branch-latest-commit.ts";
import { createFlowChangesCommand } from "../../src/ns/commands/changes/command.ts";
import { flowExecReadGraphiteBranchMetadataCommand } from "../../src/ns/commands/exec-read-graphite-branch-metadata.ts";
import { createFlowCpCommand } from "../../src/ns/commands/cp/command.ts";
import { createNsCommandRunner } from "@nseng-ai/capability-kit/command-runner";
import { createNsGitGateway } from "@nseng-ai/capability-kit";
import { RealGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import {
	nsClinkrCommandOptionsForRun,
	createCommandProgressPhaseRenderer,
	createUnavailableInteraction,
	isNsClinkrCommandRun,
} from "@nseng-ai/sdk/command";
import { resolveRenderCapabilities } from "@nseng-ai/clinkr";
import { createStreamSink } from "@nseng-ai/clinkr/stream";
import { flowPullTrunkCommand } from "../../src/ns/commands/pull-trunk.ts";
import { flowPushCommand } from "../../src/ns/commands/push.ts";
import { flowRegeneratePrCommand } from "../../src/ns/commands/regenerate-pr.ts";
import { createFlowSquashStackCommand } from "../../src/ns/commands/squash-stack.ts";
import { requestObjectToArgv } from "@nseng-ai/foundation/test-kit";
import {
	FakeGraphiteStackGateway,
	fakeStackInfo,
	type FakeGraphiteStackGatewayOptions,
} from "@nseng-ai/capability-kit/graphite/testing";
import type {
	CommandExit,
	DescriptorCommand,
	NsCommand,
	NsExtensionApi,
	NsProgress,
} from "@nseng-ai/sdk";
import { createFlowSubmitCommand } from "../../src/ns/commands/submit.ts";
import type { FlowCommandContext } from "../../src/ns/context.ts";
import { flowExtensionDescriptorSource } from "../../src/ns/extension.ts";
import { createNsSubmitRuntime } from "../../src/submit/ns-runtime.ts";
import { createFlowMinimalSubmitClientForRuntime } from "../../src/submit/real-minimal-submit.ts";

import {
	ScriptedNsTestContext,
	type RunWithFakesDefaults,
	type ScriptedExecResponse,
	type TestState,
} from "./ns-cli-fakes.ts";

const tempStateRoots: string[] = [];

afterEach(() => {
	for (const root of tempStateRoots.splice(0)) rmSync(root, { recursive: true });
});

interface RunFlowCommandWithFakesOptions {
	request?: unknown;
	state?: TestState;
	cwd?: string;
	env?: Record<string, string | undefined>;
	homeDir?: string;
	progress?: NsProgress;
	defaults?: RunWithFakesDefaults;
}

interface RunFlowSquashStackCommandWithFakesOptions extends RunFlowCommandWithFakesOptions {
	graphiteStack?: FakeGraphiteStackGatewayOptions;
}

interface RunFlowSubmitCommandWithFakesOptions extends RunFlowCommandWithFakesOptions {
	graphiteStack?: FakeGraphiteStackGatewayOptions;
}

interface FlowCommandFixture {
	command: NsCommand;
	request: unknown;
	defaults: RunWithFakesDefaults;
	options: RunFlowCommandWithFakesOptions;
	requiresModelPolicy?: boolean;
}

export function runFlowCpCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowComposableCommandWithFakes({
		createCommand: createFlowCpCommand,
		requiresModelPolicy: true,
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
					match:
						"git for-each-ref --format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref) refs/heads/main",
					result: { stdout: "refs/heads/main\0company\0refs/heads/stable\n" },
				},
				{
					match: "git worktree list --porcelain",
					result: { stdout: "worktree /work\nHEAD abc123\nbranch refs/heads/feature\n" },
				},
				{
					match: "git fetch company refs/heads/stable:refs/heads/main",
					result: { stdout: "updated\n" },
				},
			],
			textGenerationResults: () => [],
		},
	});
}

export function runFlowSquashStackCommandWithFakes(
	options: RunFlowSquashStackCommandWithFakesOptions = {},
) {
	const stackGateway = new FakeGraphiteStackGateway(
		options.graphiteStack ?? {
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					trunk: "main",
					current: "feature/top",
					ancestors: ["main", "feature/bottom"],
				}),
			},
		},
	);
	const run = runFlowCommandWithFakes({
		command: createFlowSquashStackCommand({ createGraphiteStackGateway: () => stackGateway }),
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [
				{ match: "git status --porcelain=v1", result: {} },
				{ match: "git rev-list --count main..feature/bottom", result: { stdout: "2\n" } },
				{
					match: "git rev-list --count feature/bottom..feature/top",
					result: { stdout: "3\n" },
				},
				{ match: "gt checkout feature/top --no-interactive", result: {} },
				{ match: "gt squash --no-edit --no-interactive", result: {} },
				{ match: "gt checkout feature/bottom --no-interactive", result: {} },
				{ match: "gt squash --no-edit --no-interactive", result: {} },
				{ match: "gt checkout feature/top --no-interactive", result: {} },
			],
			textGenerationResults: () => [],
		},
	});
	return { ...run, stackGateway };
}

export function runFlowBranchLatestCommitCommandWithFakes(
	options: RunFlowCommandWithFakesOptions = {},
) {
	return runFlowCommandWithFakes({
		command: flowBranchLatestCommitCommand,
		request: options.request ?? { slug: "demo-branch" },
		requiresModelPolicy: true,
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
	upstreamMode?: "none" | "synchronized";
}

function availableBranchResponses(branchName: string): ScriptedExecResponse[] {
	const segments = branchName.split("/");
	const parentResponses = segments.slice(1).map((_, index) => ({
		match: `git rev-parse --verify refs/heads/${segments.slice(0, index + 1).join("/")}`,
		result: { code: 1 },
	}));
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git rev-parse --verify refs/heads/${branchName}`, result: { code: 1 } },
		...parentResponses,
		{ match: `git for-each-ref --format=%(refname) refs/heads/${branchName}/`, result: {} },
	];
}

function exactExistingBranchResponse(branchName: string): ScriptedExecResponse[] {
	return [
		{ match: `git check-ref-format --branch ${branchName}`, result: {} },
		{ match: `git rev-parse --verify refs/heads/${branchName}`, result: {} },
	];
}

function branchLatestCommitUpstreamResponses(
	mode: BranchLatestCommitExecOptions["upstreamMode"],
): ScriptedExecResponse[] {
	const upstreamQuery = "git for-each-ref --format=%(upstream:short) refs/heads/feature";
	if (mode !== "synchronized") {
		return [{ match: upstreamQuery, result: { stdout: "" } }];
	}
	return [
		{ match: upstreamQuery, result: { stdout: "origin/feature\n" } },
		{
			match: "git rev-list --left-right --count HEAD...origin/feature",
			result: { stdout: "0\t0\n" },
		},
		{ match: "gt trunk --no-interactive", result: { stdout: "master\n" } },
	];
}

// Subprocess script for `ns flow branch-latest-commit` with an explicit `slug: "demo-branch"` (which
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
		// Preparation: inspect the local upstream relationship and, only when synchronized, trunk.
		{ match: "git branch --show-current", result: { stdout: "feature\n" } },
		...branchLatestCommitUpstreamResponses(options.upstreamMode),
		// Preparation: no Graphite children, single-parent commit, commit evidence.
		{ match: "gt children --no-interactive", result: { stdout: "" } },
		{ match: "git rev-list --parents -n 1 HEAD", result: { stdout: "abc123 parent456\n" } },
		{ match: "git log -1 --format=%B", result: { stdout: "Add demo feature\n" } },
		{ match: "git diff HEAD^ HEAD --no-ext-diff", result: { stdout: "diff --git a/x b/x\n" } },
		// Preparation: branch name availability for the requested slug.
		...(options.targetAvailability ?? availableBranchResponses("demo-branch")),
		// Transaction: repeat the local upstream relationship and conditional trunk checks.
		{ match: "git branch --show-current", result: { stdout: "feature\n" } },
		...branchLatestCommitUpstreamResponses(options.upstreamMode),
		// Transaction: recovery (backup) branch availability.
		{ match: /^git check-ref-format --branch autobranch-backup\/feature\/\d+$/, result: {} },
		{
			match: /^git rev-parse --verify refs\/heads\/autobranch-backup\/feature\/\d+$/,
			result: { code: 1 },
		},
		{ match: "git rev-parse --verify refs/heads/autobranch-backup", result: { code: 1 } },
		{
			match: "git rev-parse --verify refs/heads/autobranch-backup/feature",
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

export function branchLatestCommitSynchronizedExec(): ScriptedExecResponse[] {
	return branchLatestCommitHappyExec({ upstreamMode: "synchronized" });
}

export function branchLatestCommitSynchronizedBackupCleanupWarningExec(): ScriptedExecResponse[] {
	return branchLatestCommitHappyExec({
		upstreamMode: "synchronized",
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
		requiresModelPolicy: true,
		options,
		defaults: options.defaults ?? {
			execResponses: autobranchDirtyHappyExec,
			textGenerationResults: () => [{ ok: true, text: AUTOBRANCH_CHECKPOINT_MESSAGE }],
			missingTextGenerationResult: () => ({ ok: true, text: AUTOBRANCH_CHECKPOINT_MESSAGE }),
		},
	});
}

// Subprocess script for `ns flow autobranch --slug move-work` on a DIRTY source branch `feature/source`,
// up to and including the stash list — the prefix shared by the success and Graphite-create-failure
// paths. Capture the generated transaction marker so the fake stash list mirrors Git's response.
function autobranchDirtyExecThroughStashList(): ScriptedExecResponse[] {
	let stashMessage: string | undefined;
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
		{ match: "git rev-parse --verify refs/heads/move-work", result: { code: 1 } },
		{ match: "git for-each-ref --format=%(refname) refs/heads/move-work/", result: { stdout: "" } },
		// Transaction: stash pending changes, then locate the new stash entry by its message.
		{
			match: (call) => {
				if (
					call.command !== "git" ||
					call.args.slice(0, 4).join(" ") !== "stash push --include-untracked -m"
				) {
					return false;
				}
				const message = call.args[4];
				if (message === undefined || !/^pi-autobranch:\d+:move-work$/u.test(message)) return false;
				stashMessage = message;
				return true;
			},
			result: {},
		},
		{
			match: "git stash list --format=%gd%x00%s",
			result: () => ({
				stdout: `stash@{0}\0On feature/source: ${stashMessage ?? "missing-stash-message"}\n`,
			}),
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

// `ns flow autoslot` wraps Flow autobranch + slot-checkout orchestration through `runFlowCli`.
// The happy path moves a managed slot via a real `SlotClient` (filesystem/git side effects), which is
// out of the default fake lane. These flow scenarios exercise the wrapper end-to-end on the outcomes
// that settle BEFORE slot checkout: caps resolution, house-style rendering, and stdout/stderr routing
// via `runFlowCli`.
export function runFlowAutoslotCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		requiresModelPolicy: true,
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
	return runFlowComposableCommandWithFakes({
		requiresModelPolicy: true,
		createCommand: createFlowChangesCommand,
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
		requiresModelPolicy: true,
		command: flowRegeneratePrCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

export function runFlowSubmitCommandWithFakes(options: RunFlowSubmitCommandWithFakesOptions = {}) {
	const stackGateway = new FakeGraphiteStackGateway(
		options.graphiteStack ?? {
			stack: {
				type: "stack",
				stack: fakeStackInfo({
					trunk: "main",
					current: "feature/demo",
					ancestors: ["main"],
				}),
			},
		},
	);
	const run = runFlowCommandWithFakes({
		requiresModelPolicy: true,
		command: createFlowSubmitCommand({
			createRuntime: (ctx) =>
				createNsSubmitRuntime(ctx, flowExtensionDescriptorSource, {
					graphiteStackGateway: stackGateway,
				}),
			createMinimalClient: (ctx) =>
				createFlowMinimalSubmitClientForRuntime(
					{ cwd: ctx.cwd, commands: ctx, env: ctx.env },
					{ graphite: stackGateway },
				),
		}),
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
	return { ...run, stackGateway };
}

function runFlowComposableCommandWithFakes(
	fixture: Omit<FlowCommandFixture, "command"> & {
		createCommand: (context: FlowCommandContext) => DescriptorCommand;
	},
) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const stateRoot = mkdtempSync(join(tmpdir(), "ns-flow-command-state-"));
	tempStateRoots.push(stateRoot);
	const generatedRepoRoot = join(stateRoot, "work");
	const cwd =
		fixture.options.cwd ?? (fixture.requiresModelPolicy === true ? generatedRepoRoot : "/work");
	const repoRoot = fixture.options.cwd ?? cwd;
	if (fixture.requiresModelPolicy === true && fixture.options.cwd === undefined) {
		mkdirSync(repoRoot, { recursive: true });
		writeFileSync(
			join(repoRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
	}
	const homeDir = fixture.options.homeDir ?? join(stateRoot, "home");
	const context = new ScriptedNsTestContext(fixture.options.state, {
		cwd,
		repoRoot,
		env: {
			HOME: homeDir,
			XDG_STATE_HOME: join(stateRoot, "xdg-state"),
			...(fixture.options.env ?? {}),
		},
		execResponses: fixture.defaults.execResponses,
		textGenerationResults: fixture.defaults.textGenerationResults,
		...(fixture.options.progress === undefined ? {} : { progress: fixture.options.progress }),
		...(fixture.defaults.missingTextGenerationResult === undefined
			? {}
			: { missingTextGenerationResult: fixture.defaults.missingTextGenerationResult }),
	});
	context.stdout = (text) => stdout.push(text);
	context.stderr = (text) => stderr.push(text);
	context.onOutput = (stream, text) => liveOutput.push({ stream, text });
	const commandContext: FlowCommandContext = {
		textGenerator: context.textGenerator,
		commandRunner: createNsCommandRunner(context),
		git: createNsGitGateway(context),
		graphiteBranch: new RealGraphiteBranchGateway(context),
	};
	const command = fixture.createCommand(commandContext);
	if (!isNsClinkrCommandRun(command.run)) {
		throw new Error(`Flow ${command.name} command run lacks nsClinkrCommand metadata.`);
	}
	const spec = nsClinkrCommandOptionsForRun(command.run);
	const caps = resolveRenderCapabilities(context.renderCapabilities);
	const renderer = createCommandProgressPhaseRenderer({
		caps,
		sink: createStreamSink(caps, {
			writer: {
				write: (text) => liveOutput.push({ stream: "stderr", text }),
				redraw() {},
				done() {},
			},
			onOutput: (line) => liveOutput.push({ stream: "stderr", text: `${line}\n` }),
		}),
		forward: { isLive: context.progress.isLive, emit: context.progress.phase },
	});
	const completed = Promise.resolve(
		command.run(
			{
				ns: { catalog: { has: () => false } },
				cwd,
				events: { isLive: context.progress.isLive, emit: renderer.emit },
				interact: createUnavailableInteraction(),
				caps: context.renderCapabilities,
			},
			spec.schema.parse(fixture.request),
		),
	).then(async (result) => {
		await renderer.finish({ isFailed: result.type !== "ok" });
		if (result.type !== "ok") {
			writeCommandExitOutput(result, {
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			});
			return { result, exitCode: exitCodeForCommandExit(result) };
		}
		const data = spec.resultSchema.parse(result.data);
		const renderedResult = {
			type: "ok" as const,
			data,
			...(result.human !== undefined
				? { human: result.human }
				: spec.renderHuman === undefined
					? {}
					: { human: spec.renderHuman(data, context.renderCapabilities) }),
		};
		writeCommandExitOutput(renderedResult, {
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		});
		return { result: renderedResult, exitCode: exitCodeForCommandExit(renderedResult) };
	});
	return {
		context,
		stdout,
		stderr,
		liveOutput,
		result: completed.then((result) => result.result),
		exit: completed.then((result) => result.exitCode),
	};
}

function runFlowCommandWithFakes(fixture: FlowCommandFixture) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const stateRoot = mkdtempSync(join(tmpdir(), "ns-flow-command-state-"));
	tempStateRoots.push(stateRoot);
	const generatedRepoRoot = join(stateRoot, "work");
	const cwd =
		fixture.options.cwd ?? (fixture.requiresModelPolicy === true ? generatedRepoRoot : "/work");
	const repoRoot = fixture.options.cwd ?? cwd;
	if (fixture.requiresModelPolicy === true && fixture.options.cwd === undefined) {
		mkdirSync(repoRoot, { recursive: true });
		writeFileSync(
			join(repoRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
	}
	const homeDir = fixture.options.homeDir ?? join(stateRoot, "home");
	const context = new ScriptedNsTestContext(fixture.options.state, {
		cwd,
		repoRoot,
		env: {
			HOME: homeDir,
			XDG_STATE_HOME: join(stateRoot, "xdg-state"),
			NS_SUBMIT_FAILURE_LOG_DIR: join(stateRoot, "submit-logs"),
			...(fixture.options.env ?? {}),
		},
		execResponses: fixture.defaults.execResponses,
		textGenerationResults: fixture.defaults.textGenerationResults,
		...(fixture.options.progress === undefined ? {} : { progress: fixture.options.progress }),
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
	const completed = runFlowCommand({
		context,
		command: fixture.command,
		request: fixture.request,
		stdout: context.stdout,
		stderr: context.stderr,
	});
	return {
		context,
		stdout,
		stderr,
		liveOutput,
		result: completed.then((result) => result.result),
		exit: completed.then((result) => result.exitCode),
	};
}

async function runFlowCommand(input: {
	context: NsExtensionApi;
	command: NsCommand;
	request: unknown;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<{ exitCode: number; result: CommandExit }> {
	const result = await input.command.run(input.context, {
		argv: requestObjectToArgv(input.request, { negatedBooleanKeys: ["checks", "restack"] }),
	});
	writeCommandExitOutput(result, input);
	return { exitCode: exitCodeForCommandExit(result), result };
}

function exitCodeForCommandExit(result: CommandExit): number {
	if (result.type === "ok") return 0;
	if (result.type === "negative") return 1;
	return 2;
}

function writeCommandExitOutput(
	result: CommandExit,
	deps: { stdout: (text: string) => void; stderr: (text: string) => void },
): void {
	if (result.type === "ok") {
		const output = result.human ?? String(result.data);
		if (output !== "") deps.stdout(`${output}\n`);
		return;
	}
	if (result.type === "negative") {
		if (result.message !== "") deps.stderr(`${result.human ?? result.message}\n`);
		return;
	}
	deps.stderr(`error: ${result.message}\n`);
}

function dirtyChangesExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
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
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
	];
}

function defaultCpMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}
