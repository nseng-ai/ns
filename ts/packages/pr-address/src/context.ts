import {
	RealGithubPrFeedbackGateway,
	type GithubPrFeedbackGateway,
} from "@asdl/core/github-pr-feedback";

import {
	RealPrAddressGitGateway,
	RealPrAddressGitHubGateway,
	type PrAddressGitGateway,
	type PrAddressGitHubGateway,
} from "./gateways.ts";

export interface PrAddressContext {
	github: PrAddressGitHubGateway;
	git: PrAddressGitGateway;
	prFeedback: GithubPrFeedbackGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	const prFeedback = new RealGithubPrFeedbackGateway();
	return {
		github: new RealPrAddressGitHubGateway({ prFeedback }),
		git: new RealPrAddressGitGateway(),
		prFeedback,
	};
}
