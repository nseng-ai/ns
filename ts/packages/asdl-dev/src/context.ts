import { RealGitGateway, type GitGateway } from "./gateways/git.ts";
import { RealVercelProjectConfigStore, type VercelProjectConfigStore } from "./gateways/project-config.ts";
import { RealVercelDeploymentGateway, type VercelDeploymentGateway } from "./gateways/vercel.ts";

export type AsdlDevContext = {
	git: GitGateway;
	vercel: VercelDeploymentGateway;
	projectConfig: VercelProjectConfigStore;
};

export function createRealAsdlDevContext(): AsdlDevContext {
	return {
		git: new RealGitGateway(),
		vercel: new RealVercelDeploymentGateway(),
		projectConfig: new RealVercelProjectConfigStore(),
	};
}
