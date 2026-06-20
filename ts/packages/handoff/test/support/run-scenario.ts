import { FakeBrmemGateway, type BrmemGateway, type FakeBrmemGatewayOptions } from "@asdl/brmem";
import type { ConfirmationResult } from "@asdl/clinkr";
import { createFakeClinkrInteraction } from "@asdl/clinkr/testing";
import type { GitGateway } from "@asdl/core/git";
import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";

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
	let stdin = options.stdin;
	const fakeInteraction =
		stdin === undefined
			? createFakeClinkrInteraction({ confirmations: options.confirmations })
			: undefined;
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
		interaction:
			fakeInteraction?.interaction ??
			createFakeClinkrInteraction({ confirmations: [] }).interaction,
		stderr: stderrWriter,
	};
	const deps: CliDeps = {
		context,
		stdout: (text) => stdout.push(text),
		stderr: stderrWriter,
		...(stdin === undefined
			? { interaction: fakeInteraction?.interaction }
			: {
					stdin: async () => {
						if (typeof stdin === "function") return await stdin();
						const value = stdin ?? null;
						stdin = undefined;
						return value;
					},
				}),
	};
	const exit = runCli(args, deps).then((code) => {
		fakeInteraction?.assertComplete();
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
