import type { GitGateway } from "@ji/capability-kit/git";
import { createSdlCommandRunner } from "@ji/capability-kit";
import { createSdlGitGateway } from "@ji/capability-kit/git";
import type { SdlExtensionApi } from "@ji/kernel/sdk";
import { RealGithubPrGateway } from "./github-pr-gateway.ts";
import type { PromptSource } from "./pr-description.ts";

export interface SdlPrDescriptionRuntime {
	githubPr: RealGithubPrGateway;
	git: GitGateway;
}

/** Temporary internal migration seam; not exported from `@ji/kernel/sdk`. */
export function createSdlPrDescriptionRuntime(ctx: SdlExtensionApi): SdlPrDescriptionRuntime {
	const runner = createSdlCommandRunner(ctx);
	return {
		githubPr: new RealGithubPrGateway(runner),
		git: createSdlGitGateway(ctx),
	};
}

export function formatPromptSourceLabel(source: PromptSource): string {
	return source.type === "builtin" ? "built-in" : source.path;
}
