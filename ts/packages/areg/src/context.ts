import type {
	AregCheckProjectInspectionGateway,
	AregGithubGateway,
	AregHostGateway,
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
	skillxWorkspace: AregSkillxWorkspaceGateway;
	projectInspection: AregCheckProjectInspectionGateway;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export function createRealAregContext(options: { cwd?: string | undefined; env?: NodeJS.ProcessEnv | undefined } = {}): AregCliContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const npxSkills = new RealAregNpxSkillsGateway();
	return {
		host: new RealAregHostGateway(),
		github: new RealAregGithubGateway(),
		skillxWorkspace: new RealAregSkillxWorkspaceGateway({ npxSkills }),
		projectInspection: new RealAregCheckProjectInspectionGateway(),
		cwd,
		env,
	};
}
