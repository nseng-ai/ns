import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { RetrosCliContext } from "../../src/context.ts";
import { FakeSessionSource } from "../../src/sessions/source-fake.ts";

export interface ScenarioRunOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	context?: RetrosCliContext;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const context: RetrosCliContext = options.context ?? {
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		git: new InMemoryGitGateway(),
		sessionSource: new FakeSessionSource(),
	};
	const deps: CliDeps = {
		context,
		cwd,
		env: context.env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	return { exit: runCli(args, deps), stdout, stderr };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}
