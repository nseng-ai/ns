import type { GitGateway } from "@nseng-ai/foundation/git";
import { createNsCommandRunner } from "@nseng-ai/capability-kit";
import { createNsGitGateway } from "@nseng-ai/capability-kit";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";
import { RealGithubPrGateway } from "./github-pr-gateway.ts";
import type { PromptSource } from "./pr-description.ts";

export interface NsPrDescriptionRuntime {
	githubPr: RealGithubPrGateway;
	git: GitGateway;
}

/** Temporary internal migration seam; not exported from `@nseng-ai/kernel/sdk`. */
export function createNsPrDescriptionRuntime(ctx: NsExtensionApi): NsPrDescriptionRuntime {
	const runner = createNsCommandRunner(ctx);
	return {
		githubPr: new RealGithubPrGateway(runner),
		git: createNsGitGateway(ctx),
	};
}

export function formatPromptSourceLabel(source: PromptSource): string {
	return source.type === "builtin" ? "built-in" : source.path;
}
