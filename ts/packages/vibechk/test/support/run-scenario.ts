import { runCli, type CliDeps } from "../../src/cli.ts";

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export interface RunOptions {
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
}

export function runScenario(args: readonly string[], options: RunOptions = {}): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const env = options.env ?? { HOME: "/home/tester" };

	const deps: CliDeps = {
		cwd,
		env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};

	return {
		exit: runCli(args, deps),
		stdout,
		stderr,
	};
}
