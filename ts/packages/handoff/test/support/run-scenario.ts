import { runCli, type CliDeps } from "../../src/cli.ts";
import { type HandoffCliContext } from "../../src/context.ts";
import { FakeBrmemGateway, type FakeBrmemGatewayOptions } from "../../src/fake-brmem-gateway.ts";
import type { HandoffBrmemGateway } from "../../src/brmem-gateway.ts";
import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";
import type { GitGateway } from "@asdl/core/git";

export interface ScenarioRunOptions {
	brmem?: HandoffBrmemGateway | undefined;
	fake?: FakeBrmemGatewayOptions | undefined;
	git?: GitGateway | undefined;
	gitState?: InMemoryGitGatewayState | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	stdin?: string | (() => Promise<string>) | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	context: HandoffCliContext;
}

export function runScenario(args: readonly string[], options: ScenarioRunOptions = {}): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const stderrWriter = (text: string) => stderr.push(text);
	const stdin = options.stdin;
	const context: HandoffCliContext = {
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		git: options.git ?? new InMemoryGitGateway({ currentBranch: "feat/x", existingBranches: ["feat/x"], ...(options.gitState ?? {}) }),
		brmem: options.brmem ?? new FakeBrmemGateway(options.fake),
		stdin: async () => (typeof stdin === "function" ? await stdin() : (stdin ?? "")),
		stderr: stderrWriter,
	};
	const deps: CliDeps = {
		context,
		cwd,
		env: context.env,
		stdin: context.stdin,
		stdout: (text) => stdout.push(text),
		stderr: stderrWriter,
	};
	return { exit: runCli(args, deps), stdout, stderr, context };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}
