import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@asdl/core/git/testing";

import { runCli, type CliDeps } from "../../src/cli.ts";
import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregCheckProjectInspectionGateway,
	type FakeAregCheckProjectInspectionGatewayOptions,
	FakeAregGithubGateway,
	type FakeAregGithubGatewayOptions,
	FakeAregHostGateway,
	type FakeAregHostGatewayOptions,
	FakeAregInitProjectGateway,
	type FakeAregInitProjectGatewayOptions,
	FakeAregNpxSkillsGateway,
	type FakeAregNpxSkillsGatewayOptions,
	FakeAregPromptGateway,
	type FakeAregPromptGatewayOptions,
	FakeAregSkillxWorkspaceGateway,
	type FakeAregSkillxWorkspaceGatewayOptions,
	FakeAregUpdateProjectGateway,
	type FakeAregUpdateProjectGatewayOptions,
} from "../../src/fake-gateways.ts";

export interface ScenarioRunOptions {
	context?: AregCliContext | undefined;
	host?: FakeAregHostGatewayOptions | undefined;
	github?: FakeAregGithubGatewayOptions | undefined;
	skillxWorkspace?: FakeAregSkillxWorkspaceGatewayOptions | undefined;
	projectInspection?: FakeAregCheckProjectInspectionGatewayOptions | undefined;
	git?: InMemoryGitGatewayState | undefined;
	npxSkills?: FakeAregNpxSkillsGatewayOptions | undefined;
	prompt?: FakeAregPromptGatewayOptions | undefined;
	initProject?: FakeAregInitProjectGatewayOptions | undefined;
	updateProject?: FakeAregUpdateProjectGatewayOptions | undefined;
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
	const env = options.env ?? { PATH: "/fake/bin" };
	const npxSkills = new FakeAregNpxSkillsGateway(options.npxSkills);
	const context = options.context ?? {
		host: new FakeAregHostGateway(options.host),
		github: new FakeAregGithubGateway(options.github),
		skillxWorkspace: new FakeAregSkillxWorkspaceGateway(options.skillxWorkspace),
		projectInspection: new FakeAregCheckProjectInspectionGateway(options.projectInspection),
		git: new InMemoryGitGateway(options.git),
		npxSkills,
		prompt: new FakeAregPromptGateway(options.prompt),
		initProject: new FakeAregInitProjectGateway(options.initProject),
		updateProject: new FakeAregUpdateProjectGateway(options.updateProject),
		cwd,
		env,
	} satisfies AregCliContext;
	const deps: CliDeps = {
		context,
		cwd,
		env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	return { exit: runCli(args, deps), stdout, stderr };
}
