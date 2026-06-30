import type { ConfirmationResult } from "@sdl/clinkr";
import { createFakeClinkrInteraction } from "@sdl/clinkr/testing";
import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@sdl/capability-kit/git/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregGithubGateway,
	type FakeAregGithubGatewayOptions,
	FakeAregHostGateway,
	type FakeAregHostGatewayOptions,
	FakeAregNpxSkillsGateway,
	type FakeAregNpxSkillsGatewayOptions,
	FakeAregProjectGateway,
	type FakeAregProjectGatewayOptions,
	FakeAregPromptGateway,
	type FakeAregPromptGatewayOptions,
	FakeAregSkillxWorkspaceGateway,
	type FakeAregSkillxWorkspaceGatewayOptions,
} from "../../src/fake-gateways.ts";

export interface ScenarioRunOptions {
	context?: AregCliContext;
	host?: FakeAregHostGatewayOptions;
	github?: FakeAregGithubGatewayOptions;
	skillxWorkspace?: FakeAregSkillxWorkspaceGatewayOptions;
	project?: FakeAregProjectGatewayOptions;
	git?: InMemoryGitGatewayState;
	npxSkills?: FakeAregNpxSkillsGatewayOptions;
	prompt?: FakeAregPromptGatewayOptions;
	confirmations?: readonly ConfirmationResult[];
	isInteractive?: boolean;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
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
	const env = options.env ?? { PATH: "/fake/bin" };
	const npxSkills = new FakeAregNpxSkillsGateway(options.npxSkills);
	const fakeInteraction = createFakeClinkrInteraction({
		confirmations: options.confirmations,
		isInteractive: options.isInteractive,
	});
	const context =
		options.context ??
		({
			host: new FakeAregHostGateway(options.host),
			github: new FakeAregGithubGateway(options.github),
			skillxWorkspace: new FakeAregSkillxWorkspaceGateway(options.skillxWorkspace),
			project: new FakeAregProjectGateway(options.project),
			git: new InMemoryGitGateway(options.git),
			npxSkills,
			prompt: new FakeAregPromptGateway(options.prompt),
			interaction: fakeInteraction.interaction,
			cwd,
			env,
		} satisfies AregCliContext);
	const deps: CliDeps = {
		context,
		cwd,
		env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	return {
		exit: runCli(args, deps).then((code) => {
			fakeInteraction.assertComplete();
			return code;
		}),
		stdout,
		stderr,
	};
}
