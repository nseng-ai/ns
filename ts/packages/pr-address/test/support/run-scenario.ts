import { runCli, type CliDeps } from "../../src/cli.ts";
import type { PrAddressContext } from "../../src/context.ts";
import { fakePrAddressContext } from "./in-memory-pr-address-gateways.ts";

export interface ScenarioRunOptions {
	github?: PrAddressContext["github"] | undefined;
	git?: PrAddressContext["git"] | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	cwd?: string | undefined;
	stdin?: string | (() => Promise<string>) | undefined;
	operations?: CliDeps["operations"] | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

/** Drive the CLI in process against in-memory fakes. */
export function runScenario(
	args: readonly string[],
	options: ScenarioRunOptions = {},
): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const overrides: Partial<PrAddressContext> = {};
	if (options.github !== undefined) overrides.github = options.github;
	if (options.git !== undefined) overrides.git = options.git;
	const stdin = options.stdin;
	return {
		exit: runCli(args, {
			context: fakePrAddressContext(overrides),
			cwd: options.cwd ?? "/repo",
			env: options.env ?? { PATH: "/fake/bin" },
			stdin: typeof stdin === "function" ? stdin : async () => stdin ?? "",
			operations: options.operations,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}
