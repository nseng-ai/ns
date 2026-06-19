import { runCli, type CliDeps } from "../../src/cli.ts";
import type { AretroCliContext } from "../../src/context.ts";

export interface ScenarioRunOptions {
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
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
	const context: AretroCliContext = {
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
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
