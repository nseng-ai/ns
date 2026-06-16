import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { ObjectiveCliContext } from "../../src/context.ts";
import { FakeObjectiveStorageGateway, type FakeObjectiveStorageGatewayOptions } from "../../src/fake-storage.ts";
import { ObjectiveStorage } from "../../src/storage.ts";

export interface ScenarioRunOptions {
	context?: ObjectiveCliContext | undefined;
	fake?: FakeObjectiveStorageGatewayOptions | undefined;
	git?: InMemoryGitGatewayState | undefined;
	trunkBranch?: string | undefined;
	cwd?: string | undefined;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface ScenarioRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

export function runScenario(args: readonly string[], options: ScenarioRunOptions = {}): ScenarioRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const cwd = options.cwd ?? "/repo";
	const context = options.context ?? {
		cwd,
		env: options.env ?? { PATH: "/fake/bin" },
		repoRoot: cwd,
		trunkBranch: options.trunkBranch ?? "master",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(options.fake)),
		git: new InMemoryGitGateway(options.git),
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
