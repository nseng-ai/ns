import type { ConfirmationResult } from "@sdl/clinkr";
import { createOneShotStdinAdapter, createScenarioClinkrInteraction } from "@sdl/clinkr/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { SlotCliContext } from "../../src/context.ts";
import { FakeClipboardGateway, type ClipboardCopyResult } from "../../src/gateways/clipboard.ts";
import {
	FakeSlotCommandGateway,
	type FakeSlotCommandGatewayOptions,
} from "../../src/gateways/fakes/command.ts";
import {
	FakeSlotRepositoryGateway,
	type FakeSlotRepositoryGatewayOptions,
} from "../../src/gateways/fakes/repository.ts";
import {
	FakeGraphiteStackGateway,
	type FakeGraphiteStackGatewayOptions,
} from "@sdl/graphite/testing";
import { FakeSlotPrGateway, type FakeSlotPrGatewayOptions } from "../../src/gateways/fakes/pr.ts";
import { FakeSlotStorageGateway } from "../../src/gateways/fakes/storage.ts";
import type { RepoContext } from "../../src/repo-context.ts";

export interface ScenarioRunOptions {
	git?: FakeSlotRepositoryGatewayOptions | undefined;
	gt?: FakeGraphiteStackGatewayOptions | undefined;
	pr?: FakeSlotPrGatewayOptions | undefined;
	cwd?: string | undefined;
	stdin?: string | (() => Promise<string | null>) | undefined;
	confirmations?: readonly ConfirmationResult[] | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	repo?: RepoContext | { type: "no_repo"; errorType: "not_in_repo"; message: string } | undefined;
	clipboardResult?: ClipboardCopyResult | undefined;
	command?: FakeSlotCommandGatewayOptions | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	git: FakeSlotRepositoryGateway;
	gt: FakeGraphiteStackGateway;
	pr: FakeSlotPrGateway;
	storage: FakeSlotStorageGateway;
	command: FakeSlotCommandGateway;
	context: SlotCliContext;
}

export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const git = new FakeSlotRepositoryGateway(options.git);
	const gt = new FakeGraphiteStackGateway(options.gt ?? {});
	const pr = new FakeSlotPrGateway(options.pr);
	const storage = new FakeSlotStorageGateway();
	const command = new FakeSlotCommandGateway(options.command);
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
		command,
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
	return { exit, stdout, stderr, git, gt, pr, storage, command, context };
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
