import { optionalEntry } from "@ns/core/primitives";
import { runCli, type CliDeps } from "../../src/cli.ts";
import type { PrAddressContext } from "../../src/context.ts";
import { fakePrAddressContext } from "./in-memory-pr-address-gateways.ts";

export interface ScenarioRunOptions {
	git?: PrAddressContext["git"];
	prFeedback?: PrAddressContext["prFeedback"];
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	stdin?: string | (() => Promise<string>);
	operations?: CliDeps["operations"];
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
	if (options.git !== undefined) overrides.git = options.git;
	if (options.prFeedback !== undefined) overrides.prFeedback = options.prFeedback;
	const stdin = options.stdin;
	return {
		exit: runCli(args, {
			context: fakePrAddressContext(overrides),
			cwd: options.cwd ?? "/repo",
			env: options.env ?? { PATH: "/fake/bin" },
			stdin: typeof stdin === "function" ? stdin : async () => stdin ?? "",
			...optionalEntry("operations", options.operations),
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}
