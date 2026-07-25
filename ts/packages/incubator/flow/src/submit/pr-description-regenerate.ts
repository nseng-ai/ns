import type { GitGateway } from "@nseng-ai/foundation/git";
import { createNsCommandRunner } from "@nseng-ai/extension-kit";
import { createNsGitGateway } from "@nseng-ai/extension-kit";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { RealGithubPrGateway } from "./github-pr-gateway.ts";

export interface NsPrDescriptionRuntime {
	githubPr: RealGithubPrGateway;
	git: GitGateway;
}

/** Temporary internal migration seam; not exported from `@nseng-ai/sdk`. */
export function createNsPrDescriptionRuntime(ctx: NsExtensionApi): NsPrDescriptionRuntime {
	const runner = createNsCommandRunner(ctx);
	return {
		githubPr: new RealGithubPrGateway(runner),
		git: createNsGitGateway(ctx),
	};
}
