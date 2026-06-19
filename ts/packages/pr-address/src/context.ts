import {
	RealGithubPrFeedbackGateway,
	type GithubPrFeedbackGateway,
} from "@asdl/core/github-pr-feedback";

import { RealPrAddressGitGateway, type PrAddressGitGateway } from "./gateways.ts";

export interface PrAddressContext {
	git: PrAddressGitGateway;
	prFeedback: GithubPrFeedbackGateway;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		git: new RealPrAddressGitGateway(),
		prFeedback: new RealGithubPrFeedbackGateway(),
	};
}
