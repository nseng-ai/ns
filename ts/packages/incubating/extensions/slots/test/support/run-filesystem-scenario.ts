import { resolveClinkrInteraction, type ConfirmationResult } from "@nseng-ai/clinkr";
import { createClinkrApp, resolveClinkrOutputFormat } from "@nseng-ai/clinkr/app";
import type { RenderCapabilities } from "@nseng-ai/clinkr/legacy";
import { createFakeClinkrInteraction, createOneShotStdinAdapter } from "@nseng-ai/clinkr/testing";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import { noopNsCommandIo, noopNsProgress, type NsExtensionApi } from "@nseng-ai/sdk";

import type { SlotCliContext } from "../../src/core/context.ts";
import {
	FakeClipboardGateway,
	type ClipboardCopyResult,
} from "../../src/core/gateways/clipboard.ts";
import {
	FakeSlotCommandGateway,
	type FakeSlotCommandGatewayOptions,
} from "../../src/core/gateways/fakes/command.ts";
import { FakeSlotRepositoryGateway } from "../../src/core/gateways/fakes/repository.ts";
import {
	FakeGraphiteStackGateway,
	type FakeGraphiteStackGatewayOptions,
} from "@nseng-ai/extension-kit/graphite/testing";
import {
	FakeSlotPrGateway,
	type FakeSlotPrGatewayOptions,
} from "../../src/core/gateways/fakes/pr.ts";
import {
	FakeSlotProvisionFilesGateway,
	type FakeSlotProvisionFilesGatewayOptions,
} from "../../src/core/gateways/fakes/provision-files.ts";
import { FakeSlotStorageGateway } from "../../src/core/gateways/fakes/storage.ts";
import type { RepoContext, RepoDiscoveryResult } from "../../src/core/repo-context.ts";

export interface FilesystemScenarioOptions {
	readonly git?: ConstructorParameters<typeof FakeSlotRepositoryGateway>[0];
	readonly gt?: FakeGraphiteStackGatewayOptions;
	readonly confirmations?: readonly ConfirmationResult[];
	readonly clipboardResult?: ClipboardCopyResult;
	readonly command?: FakeSlotCommandGatewayOptions;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly pr?: FakeSlotPrGatewayOptions;
	readonly provisionFiles?: FakeSlotProvisionFilesGatewayOptions;
	readonly renderCapabilities?: RenderCapabilities;
	readonly repo?: RepoDiscoveryResult;
	readonly stdin?: string | (() => Promise<string | null>);
}

export interface FilesystemScenarioRun {
	readonly exit: Promise<number>;
	readonly stdout: string[];
	readonly stderr: string[];
	readonly command: FakeSlotCommandGateway;
	readonly git: FakeSlotRepositoryGateway;
	readonly gt: FakeGraphiteStackGateway;
	readonly pr: FakeSlotPrGateway;
	readonly storage: FakeSlotStorageGateway;
	readonly provisionFiles: FakeSlotProvisionFilesGateway;
}

export interface FilesystemCompletionRun {
	readonly values: Promise<string[]>;
	readonly git: FakeSlotRepositoryGateway;
}

export function runFilesystemScenario(
	args: readonly string[],
	options: FilesystemScenarioOptions = {},
): FilesystemScenarioRun {
	const fixture = createFilesystemFixture(options);
	fixture.api.outputFormat = resolveClinkrOutputFormat(["slot", ...args]);
	const exit = buildFilesystemSlotApp().run(["slot", ...args], {
		context: fixture.api,
		output: {
			stdout: (text) => fixture.stdout.push(text),
			stderr: (text) => fixture.stderr.push(text),
		},
		canEmitAnsi: fixture.context.renderCapabilities.canEmitAnsi,
	});
	return {
		exit,
		stdout: fixture.stdout,
		stderr: fixture.stderr,
		command: fixture.command,
		git: fixture.git,
		gt: fixture.gt,
		pr: fixture.pr,
		storage: fixture.storage,
		provisionFiles: fixture.provisionFiles,
	};
}

export function completeFilesystemScenario(
	words: readonly string[],
	options: FilesystemScenarioOptions = {},
): FilesystemCompletionRun {
	const fixture = createFilesystemFixture(options);
	const values = buildFilesystemSlotApp()
		.complete({ words: ["slot", ...words] }, { context: fixture.api })
		.then((result) => result.candidates.map((candidate) => candidate.value));
	return { values, git: fixture.git };
}

function buildFilesystemSlotApp() {
	return createClinkrApp<NsExtensionApi>({
		name: "ns",
		requiresContext: true,
		commandDirectory: `${import.meta.dirname}/../../src/ns/cli`,
		completion: {},
	});
}

function createFilesystemFixture(options: FilesystemScenarioOptions): {
	readonly api: NsExtensionApi;
	readonly context: SlotCliContext;
	readonly stdout: string[];
	readonly stderr: string[];
	readonly command: FakeSlotCommandGateway;
	readonly git: FakeSlotRepositoryGateway;
	readonly gt: FakeGraphiteStackGateway;
	readonly pr: FakeSlotPrGateway;
	readonly storage: FakeSlotStorageGateway;
	readonly provisionFiles: FakeSlotProvisionFilesGateway;
} {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const git = new FakeSlotRepositoryGateway(options.git);
	const gt = new FakeGraphiteStackGateway(options.gt ?? {});
	const pr = new FakeSlotPrGateway(options.pr);
	const storage = new FakeSlotStorageGateway();
	const provisionFiles = new FakeSlotProvisionFilesGateway(options.provisionFiles);
	const clipboard = new FakeClipboardGateway(options.clipboardResult);
	const command = new FakeSlotCommandGateway(options.command);
	const stdin = createOneShotStdinAdapter(options.stdin);
	const fakeInteraction =
		options.confirmations === undefined
			? undefined
			: createFakeClinkrInteraction({ confirmations: options.confirmations, isInteractive: true });
	const context: SlotCliContext = {
		repo: options.repo ?? repoContext(),
		git,
		gt,
		pr,
		storage,
		provisionFiles,
		clipboard,
		command,
		clock: createManualClock(Date.UTC(2026, 6, 12, 12)).clock,
		cwd: options.cwd ?? "/repo",
		renderCapabilities: options.renderCapabilities ?? { canEmitAnsi: false },
		interaction:
			fakeInteraction?.interaction ??
			resolveClinkrInteraction({
				stdin,
				stderr: (text) => stderr.push(text),
				...(options.stdin === undefined ? {} : { injectedStdin: stdin }),
			}),
		stderr: (text) => stderr.push(text),
		env: options.env ?? { PATH: "/fake/bin" },
		slotsRoot: "/slots",
		shouldWriteCdDirective: true,
	};
	return {
		api: createScenarioNsApi(context),
		context,
		stdout,
		stderr,
		command,
		git,
		gt,
		pr,
		storage,
		provisionFiles,
	};
}

function createScenarioNsApi(context: SlotCliContext): NsExtensionApi {
	return {
		cwd: context.cwd,
		env: context.env,
		exec: async () => ({ type: "exited", stdout: "", stderr: "", code: 0, signal: null }),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: context.renderCapabilities,
		hasExtension: () => false,
		isInteractive: () => false,
		confirm: () => {
			throw new Error("Unexpected ns host confirmation in Slot scenario.");
		},
		select: () => {
			throw new Error("Unexpected ns host selection in Slot scenario.");
		},
		stdout: () => {},
		stderr: context.stderr,
		extensions: { slotCommandContext: { context } },
	};
}

function repoContext(): RepoContext {
	return {
		type: "repo",
		root: "/repo",
		mainRepoRoot: "/repo",
		repoName: "repo",
		repoDir: "/slots/repos/repo",
		worktreesDir: "/slots/repos/repo/worktrees",
	};
}
