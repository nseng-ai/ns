import type { ConfirmationResult } from "@asdl/clinkr";
import { createOneShotStdinAdapter, createScenarioClinkrInteraction } from "@asdl/clinkr/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { SlotCliContext } from "../../src/context.ts";
import { FakeClipboardGateway, type ClipboardCopyResult } from "../../src/gateways/clipboard.ts";
import {
	FakeSlotGitGateway,
	type FakeSlotGitGatewayOptions,
} from "../../src/gateways/fakes/git.ts";
import { FakeSlotGtGateway, type FakeSlotGtGatewayOptions } from "../../src/gateways/fakes/gt.ts";
import { FakeSlotPrGateway, type FakeSlotPrGatewayOptions } from "../../src/gateways/fakes/pr.ts";
import { FakeSlotStorageGateway } from "../../src/gateways/fakes/storage.ts";
import type { RepoContext } from "../../src/repo-context.ts";

export interface ScenarioRunOptions {
	git?: FakeSlotGitGatewayOptions | undefined;
	gt?: FakeSlotGtGatewayOptions | undefined;
	pr?: FakeSlotPrGatewayOptions | undefined;
	cwd?: string | undefined;
	stdin?: string | (() => Promise<string | null>) | undefined;
	confirmations?: readonly ConfirmationResult[] | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	repo?: RepoContext | { type: "no_repo"; errorType: "not_in_repo"; message: string } | undefined;
	clipboardResult?: ClipboardCopyResult | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	git: FakeSlotGitGateway;
	gt: FakeSlotGtGateway;
	pr: FakeSlotPrGateway;
	storage: FakeSlotStorageGateway;
	context: SlotCliContext;
}

export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const git = new FakeSlotGitGateway(options.git);
	const gt = new FakeSlotGtGateway(options.gt ?? {});
	const pr = new FakeSlotPrGateway(options.pr);
	const storage = new FakeSlotStorageGateway();
	const scenarioInteraction = createScenarioClinkrInteraction({
		hasStdin: options.stdin !== undefined,
		confirmations: options.confirmations,
	});
	const repo = options.repo ?? repoContext();
	const context: SlotCliContext = {
		repo,
		git,
		gt,
		pr,
		storage,
		clipboard: new FakeClipboardGateway(options.clipboardResult),
		cwd,
		interaction: scenarioInteraction.contextInteraction,
		stderr: (text) => stderr.push(text),
		env: options.env ?? { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: true,
	};
	const deps: CliDeps = {
		context,
		cwd,
		env: context.env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		...(scenarioInteraction.depsInteraction === undefined
			? { stdin: createOneShotStdinAdapter(options.stdin) }
			: { interaction: scenarioInteraction.depsInteraction }),
	};
	const exit = runCli(args, deps).then((code) => {
		scenarioInteraction.assertComplete();
		return code;
	});
	return { exit, stdout, stderr, git, gt, pr, storage, context };
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

export function slotWorktree(
	slotName: string,
	branch: string | null = null,
): { path: string; branch: string | null } {
	return { path: `/slots/repos/repo/worktrees/${slotName}`, branch };
}
