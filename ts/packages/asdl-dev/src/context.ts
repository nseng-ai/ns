import { RealCheckpointGateway, type CheckpointGateway } from "./checkpoint.ts";
import { RealGitGateway, type GitGateway } from "./gateways/git.ts";
import { RealVercelProjectConfigStore, type VercelProjectConfigStore } from "./gateways/project-config.ts";
import { RealVercelDeploymentGateway, type VercelDeploymentGateway } from "./gateways/vercel.ts";
import { PiTextGenerationGateway } from "./pi-text-generation.ts";
import { RealSubmitGateway, type SubmitGateway } from "./submit.ts";
import { DEFAULT_TEXT_BACKEND, type TextGenerationBackend, type TextGenerationGateway } from "./text-generation.ts";

export interface AsdlDevContext {
	git: GitGateway;
	vercel: VercelDeploymentGateway;
	projectConfig: VercelProjectConfigStore;
	checkpoint: CheckpointGateway;
	submit: SubmitGateway;
	textGeneration: TextGenerationGateway;
}

export function createTextGenerationGateway(backend: TextGenerationBackend = DEFAULT_TEXT_BACKEND): TextGenerationGateway {
	if (backend === "pi") {
		return new PiTextGenerationGateway();
	}

	return unreachableBackend(backend);
}

export function createRealAsdlDevContext(): AsdlDevContext {
	return {
		git: new RealGitGateway(),
		vercel: new RealVercelDeploymentGateway(),
		projectConfig: new RealVercelProjectConfigStore(),
		checkpoint: new RealCheckpointGateway(),
		submit: new RealSubmitGateway(),
		textGeneration: createTextGenerationGateway(),
	};
}

function unreachableBackend(backend: never): never {
	throw new Error(`Unsupported text generation backend: ${backend}`);
}
