import {
	RealGithubPrFeedbackGateway,
	type GithubPrFeedbackGateway,
} from "@asdl/core/github-pr-feedback";

import type { PrAddressGitGateway } from "./core/gateways.ts";
import { RealPrAddressGitGateway } from "./gateways.ts";

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
