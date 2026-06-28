import {
	FakeBrmemGateway,
	type BrmemGateway,
	type BrmemSourceReader,
	type FakeBrmemGatewayOptions,
	type SourceBytesResult,
} from "@sdl/brmem";
import type { ConfirmationResult } from "@sdl/clinkr";
import { createOneShotStdinAdapter, createScenarioClinkrInteraction } from "@sdl/clinkr/testing";
import type { GitGateway } from "@sdl/core/git";
import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@sdl/core/git/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import { type HandoffCliContext } from "../../src/context.ts";

export interface ScenarioRunOptions {
	brmem?: BrmemGateway | undefined;
	fake?: FakeBrmemGatewayOptions | undefined;
	git?: GitGateway | undefined;
	gitState?: InMemoryGitGatewayState | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: string | (() => Promise<string | null>) | undefined;
	sourceReader?: BrmemSourceReader | undefined;
	confirmations?: readonly ConfirmationResult[] | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	context: HandoffCliContext;
}

export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const stderrWriter = (text: string) => stderr.push(text);
	const scenarioInteraction = createScenarioClinkrInteraction({
		hasStdin: options.stdin !== undefined,
		confirmations: options.confirmations,
	});
	const context: HandoffCliContext = {
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		git:
			options.git ??
			new InMemoryGitGateway({
				currentBranch: "feat/x",
				existingBranches: ["feat/x"],
				...options.gitState,
			}),
		brmem: options.brmem ?? new FakeBrmemGateway(options.fake),
		sourceReader: options.sourceReader ?? new ScenarioSourceReader(options.stdin),
		interaction: scenarioInteraction.contextInteraction,
		stderr: stderrWriter,
	};
	const deps: CliDeps = {
		context,
		stdout: (text) => stdout.push(text),
		stderr: stderrWriter,
		...(scenarioInteraction.depsInteraction === undefined
			? { stdin: createOneShotStdinAdapter(options.stdin) }
			: { interaction: scenarioInteraction.depsInteraction }),
	};
	const exit = runCli(args, deps).then((code) => {
		scenarioInteraction.assertComplete();
		return code;
	});
	return { exit, stdout, stderr, context };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}

export async function putHandoffEntry(
	gateway: FakeBrmemGateway,
	options: { namespace?: string | undefined; key: string; branch: string; content: string },
): Promise<string> {
	const result = await gateway.putEntry({
		namespace: options.namespace ?? "handoff",
		key: options.key,
		branch: options.branch,
		content: options.content,
	});
	if (result.type === "error") throw new Error(result.error.message);
	return result.value.commitSha;
}

export async function getEntryContent(
	gateway: FakeBrmemGateway,
	options: { namespace?: string | undefined; key: string; branch: string },
): Promise<string | undefined> {
	const result = await gateway.getEntry({
		namespace: options.namespace ?? "handoff",
		key: options.key,
		branch: options.branch,
	});
	if (result.type === "error") throw new Error(result.error.message);
	if (result.type === "missing") return undefined;
	return result.value.content;
}

class ScenarioSourceReader implements BrmemSourceReader {
	private readonly stdin: string | (() => Promise<string | null>) | undefined;

	constructor(stdin: string | (() => Promise<string | null>) | undefined) {
		this.stdin = stdin;
	}

	async readFileBytes(): Promise<SourceBytesResult> {
		return { type: "missing" };
	}

	async readStdinBytes(): Promise<Uint8Array> {
		const value = typeof this.stdin === "function" ? await this.stdin() : this.stdin;
		return new TextEncoder().encode(value ?? "");
	}
}
