import type {
	AregCheckProjectInspectionGateway,
	AregGithubGateway,
	AregHostGateway,
	AregNpxSkillsGateway,
	AregSkillxWorkspaceGateway,
} from "./gateways.ts";
import {
	RealAregCheckProjectInspectionGateway,
	RealAregGithubGateway,
	RealAregHostGateway,
	RealAregNpxSkillsGateway,
	RealAregSkillxWorkspaceGateway,
} from "./real-gateways.ts";

export interface AregCliContext {
	host: AregHostGateway;
	github: AregGithubGateway;
	npxSkills: AregNpxSkillsGateway;
	skillxWorkspace: AregSkillxWorkspaceGateway;
	projectInspection: AregCheckProjectInspectionGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export interface AregCliContextDeps {
	host: AregHostGateway;
	github: AregGithubGateway;
	npxSkills: AregNpxSkillsGateway;
	skillxWorkspace: AregSkillxWorkspaceGateway;
	projectInspection: AregCheckProjectInspectionGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createAregCliContext(deps: AregCliContextDeps): AregCliContext {
	return {
		host: deps.host,
		github: deps.github,
		npxSkills: deps.npxSkills,
		skillxWorkspace: deps.skillxWorkspace,
		projectInspection: deps.projectInspection,
		cwd: deps.cwd,
		env: deps.env,
	};
}

export function createRealAregContext(options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {}): AregCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const npxSkills = new RealAregNpxSkillsGateway();
	return createAregCliContext({
		host: new RealAregHostGateway(),
		github: new RealAregGithubGateway(),
		npxSkills,
		skillxWorkspace: new RealAregSkillxWorkspaceGateway({ npxSkills }),
		projectInspection: new RealAregCheckProjectInspectionGateway(),
		cwd,
		env,
	});
}
