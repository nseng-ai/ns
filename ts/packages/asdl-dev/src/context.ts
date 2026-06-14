import { NodeCommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";
import { RealGithubPrGateway, type GithubPrGateway } from "@asdl/core/submit";

import { createTextGenerationGateway } from "@asdl/sdl/context";
import { RealVercelProjectConfigStore, type VercelProjectConfigStore } from "./gateways/project-config.ts";
import { RealVercelDeploymentGateway, type VercelDeploymentGateway } from "./gateways/vercel.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

export interface AsdlDevContext {
	git: GitGateway;
	vercel: VercelDeploymentGateway;
	projectConfig: VercelProjectConfigStore;
	githubPr: GithubPrGateway;
	textGeneration: TextGenerationGateway;
}

export function createRealAsdlDevContext(): AsdlDevContext {
	return {
		git: new RealGitGateway(new NodeCommandExecApi()),
		vercel: new RealVercelDeploymentGateway(),
		projectConfig: new RealVercelProjectConfigStore(),
		githubPr: new RealGithubPrGateway(),
		textGeneration: createTextGenerationGateway(),
	};
}
