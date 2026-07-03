import { NodeCommandExecApi, runCommand } from "@ns/core/exec";
import { RealGitGateway } from "@ns/capability-kit/git";
import type { GitGateway } from "@ns/capability-kit/git";
import { RealGithubPrFeedbackGateway } from "@ns/capability-kit/github/pr-feedback";
import type { GithubPrFeedbackGateway } from "./api.ts";

export interface PrAddressContext {
	git: GitGateway;
	prFeedback: GithubPrFeedbackGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		git: new RealGitGateway(new NodeCommandExecApi()),
		prFeedback: new RealGithubPrFeedbackGateway(runCommand),
	};
}
