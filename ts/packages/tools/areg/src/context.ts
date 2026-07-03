import { resolveClinkrInteraction, type ClinkrInteraction } from "@ns/clinkr";
import { NodeCommandExecApi } from "@ns/core/exec";
import { RealGitGateway } from "@ns/capability-kit/git";
import type { GitGateway } from "@ns/capability-kit/git";
import { readStdinLine } from "@ns/core/cli-runtime";

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
	interaction: ClinkrInteraction;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createRealAregContext(
	options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
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
		interaction: resolveClinkrInteraction({
			stdin: readStdinLine,
			stderr: (text) => process.stderr.write(text),
		}),
		cwd,
		env,
	};
}
