import { runCli, type CliDeps } from "../../src/cli.ts";
import type { SlotCliContext } from "../../src/context.ts";
import { FakeClipboardGateway } from "../../src/gateways/clipboard.ts";
import { FakeSlotGitGateway, type FakeSlotGitGatewayOptions } from "../../src/gateways/fakes/git.ts";
import { FakeSlotPRGateway, type FakeSlotPRGatewayOptions } from "../../src/gateways/fakes/pr.ts";
import { FakeSlotStorageGateway } from "../../src/gateways/fakes/storage.ts";
import type { RepoContext } from "../../src/repo-context.ts";

export interface ScenarioRunOptions {
	git?: FakeSlotGitGatewayOptions | undefined;
	pr?: FakeSlotPRGatewayOptions | FakeSlotPRGateway | undefined;
	stdin?: string | (() => Promise<string>) | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	repo?: RepoContext | { type: "no_repo"; errorType: "not_in_repo"; message: string } | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	git: FakeSlotGitGateway;
	pr: FakeSlotPRGateway;
	storage: FakeSlotStorageGateway;
	context: SlotCliContext;
}

export function runScenario(args: readonly string[], options: ScenarioRunOptions = {}): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const git = new FakeSlotGitGateway(options.git);
	const storage = new FakeSlotStorageGateway();
	const pr = options.pr instanceof FakeSlotPRGateway ? options.pr : new FakeSlotPRGateway(options.pr);
	const stdinText = typeof options.stdin === "string" ? options.stdin : "";
	const stdin = typeof options.stdin === "function" ? options.stdin : async () => stdinText;
	const repo = options.repo ?? repoContext();
	const context: SlotCliContext = {
		repo,
		git,
		storage,
		clipboard: new FakeClipboardGateway(),
		pr,
		stdin,
		stderr: (text) => stderr.push(text),
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: true,
	};
	const deps: CliDeps = { context, cwd, env: context.env, stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text), stdin };
	return { exit: runCli(args, deps), stdout, stderr, git, pr, storage, context };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}

export function repoContext(overrides: Partial<RepoContext> = {}): RepoContext {
	const mainRepoRoot = overrides.mainRepoRoot ?? "/repo";
	const repoName = overrides.repoName ?? mainRepoRoot.split("/").at(-1) ?? "repo";
	const repoDir = overrides.repoDir ?? `/slots/repos/${repoName}`;
	return {
		type: "repo",
		root: overrides.root ?? mainRepoRoot,
		mainRepoRoot,
		repoName,
		repoDir,
		worktreesDir: overrides.worktreesDir ?? `${repoDir}/worktrees`,
	};
}

export function slotWorktree(slotName: string, branch: string | null = null): { path: string; branch: string | null } {
	return { path: `/slots/repos/repo/worktrees/${slotName}`, branch };
}
