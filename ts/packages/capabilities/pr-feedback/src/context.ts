import { NodeCommandExecApi, runCommand } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { RealGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/pr-feedback";
import type { PrAddressGithubGateway, PrAddressGitGateway } from "./api.ts";

export interface PrAddressContext {
	git: PrAddressGitGateway;
	prFeedback: PrAddressGithubGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		git: new RealGitGateway(new NodeCommandExecApi()),
		prFeedback: new RealGithubPrFeedbackGateway(runCommand),
	};
}
