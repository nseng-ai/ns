import { runCli, type CliDeps } from "../../src/cli.ts";
import { type BrmemCliContext } from "../../src/context.ts";
import { FakeBrmemGateway, type FakeBrmemGatewayOptions } from "../../src/fake-gateway.ts";
import type { BrmemGateway } from "../../src/gateway.ts";

export interface ScenarioRunOptions {
	gateway?: BrmemGateway | undefined;
	fake?: FakeBrmemGatewayOptions | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	cwd?: string | undefined;
	stdin?: string | (() => Promise<string>) | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export function runScenario(args: readonly string[], options: ScenarioRunOptions = {}): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const stdin = options.stdin;
	const cwd = options.cwd ?? "/repo";
	const context: BrmemCliContext = {
		gateway: options.gateway ?? new FakeBrmemGateway(options.fake),
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		stdin: typeof stdin === "function" ? stdin : async () => stdin ?? "",
	};
	const deps: CliDeps = {
		context,
		cwd,
		env: context.env,
		stdin: context.stdin,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	return { exit: runCli(args, deps), stdout, stderr };
}

export function parseJsonOutput(run: ScenarioRun): unknown {
	return JSON.parse(run.stdout.join(""));
}
