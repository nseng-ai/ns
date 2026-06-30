import {
	isClinkrHumanOutputInvocation,
	renderCapabilitiesForTerminal,
	resolveClinkrInteraction,
	type Caps,
	type ConfirmationResult,
} from "@sdl/clinkr";
import { createFakeClinkrInteraction, createOneShotStdinAdapter } from "@sdl/clinkr/testing";

import { buildSlotCommandGroup } from "../../src/command-face.ts";
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
	git?: FakeSlotRepositoryGatewayOptions;
	gt?: FakeGraphiteStackGatewayOptions;
	pr?: FakeSlotPrGatewayOptions;
	cwd?: string;
	stdin?: string | (() => Promise<string | null>);
	confirmations?: readonly ConfirmationResult[];
	env?: NodeJS.ProcessEnv;
	repo?: RepoContext | { type: "no_repo"; errorType: "not-in-repo"; message: string };
	clipboardResult?: ClipboardCopyResult;
	command?: FakeSlotCommandGatewayOptions;
	canEmitAnsi?: boolean;
	caps?: Caps;
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

export interface CompletionScenarioRun {
	values: Promise<string[]>;
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
	const fixture = buildScenarioFixture(args, options);
	const exit = buildSlotCommandGroup<SlotCliContext>()
		.run(args, {
			context: fixture.context,
			io: {
				stdout: (text) => fixture.stdout.push(text),
				stderr: (text) => fixture.stderr.push(text),
				canEmitAnsi: options.canEmitAnsi ?? false,
			},
		})
		.then((code) => {
			fixture.assertComplete();
			return code;
		});
	return { exit, ...completionScenarioRunFields(fixture) };
}

export function completeScenario(
	words: readonly string[],
	options: ScenarioRunOptions = {},
): CompletionScenarioRun {
	const fixture = buildScenarioFixture(words, options);
	const values = buildSlotCommandGroup<SlotCliContext>()
		.completeAsync({ words }, { context: fixture.context })
		.then((result) => {
			fixture.assertComplete();
			return result.candidates.map((candidate) => candidate.value);
		});
	return { values, ...completionScenarioRunFields(fixture) };
}

function completionScenarioRunFields(
	fixture: Omit<ScenarioRun, "exit"> & { assertComplete: () => void },
): Omit<ScenarioRun, "exit"> {
	return {
		stdout: fixture.stdout,
		stderr: fixture.stderr,
		git: fixture.git,
		gt: fixture.gt,
		pr: fixture.pr,
		storage: fixture.storage,
		command: fixture.command,
		context: fixture.context,
	};
}

function buildScenarioFixture(
	args: readonly string[],
	options: ScenarioRunOptions,
): Omit<ScenarioRun, "exit"> & { assertComplete: () => void } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const git = new FakeSlotRepositoryGateway(options.git);
	const gt = new FakeGraphiteStackGateway(options.gt ?? {});
	const pr = new FakeSlotPrGateway(options.pr);
	const storage = new FakeSlotStorageGateway();
	const command = new FakeSlotCommandGateway(options.command);
	const stdin = createOneShotStdinAdapter(options.stdin);
	const fakeInteraction =
		options.confirmations === undefined
			? undefined
			: createFakeClinkrInteraction({ confirmations: options.confirmations, isInteractive: true });
	const interaction =
		fakeInteraction?.interaction ??
		resolveClinkrInteraction({
			stdin,
			stderr: (text) => stderr.push(text),
			...(options.stdin === undefined ? {} : { injectedStdin: stdin }),
		});
	const repo = options.repo ?? repoContext();
	const renderCapabilities =
		options.caps === undefined
			? { canEmitAnsi: options.canEmitAnsi ?? false }
			: renderCapabilitiesForTerminal(options.caps);
	// Slot package scenarios exercise the mounted command face directly. Entrypoint
	// metadata (`--version`/`--runtime`) is covered by the owning `sdl` CLI tests.
	const context: SlotCliContext = {
		repo,
		git,
		gt,
		pr,
		storage,
		clipboard: new FakeClipboardGateway(options.clipboardResult),
		command,
		cwd,
		renderCapabilities,
		interaction,
		stderr: (text) => stderr.push(text),
		env: options.env ?? { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: isClinkrHumanOutputInvocation(args),
	};
	return {
		stdout,
		stderr,
		git,
		gt,
		pr,
		storage,
		command,
		context,
		assertComplete: () => fakeInteraction?.assertComplete(),
	};
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
