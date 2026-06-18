import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import type {
	AregGithubGateway,
	AregHostGateway,
	AregNpxSkillsGateway,
	AregProjectGateway,
	AregPromptGateway,
	AregSkillxWorkspaceGateway,
} from "./gateways.ts";
import {
	RealAregGithubGateway,
	RealAregHostGateway,
	RealAregNpxSkillsGateway,
	RealAregProjectGateway,
	RealAregPromptGateway,
	RealAregSkillxWorkspaceGateway,
} from "./real-gateways.ts";

export interface AregCliContext {
	host: AregHostGateway;
	github: AregGithubGateway;
	skillxWorkspace: AregSkillxWorkspaceGateway;
	project: AregProjectGateway;
	git: GitGateway;
	npxSkills: AregNpxSkillsGateway;
	prompt: AregPromptGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createRealAregContext(
	options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {},
): AregCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const npxSkills = new RealAregNpxSkillsGateway();
	const git = new RealGitGateway(new NodeCommandExecApi());
	return {
		host: new RealAregHostGateway(),
		github: new RealAregGithubGateway(),
		skillxWorkspace: new RealAregSkillxWorkspaceGateway({ npxSkills }),
		project: new RealAregProjectGateway({ git }),
		git,
		npxSkills,
		prompt: new RealAregPromptGateway(),
		cwd,
		env,
	};
}
