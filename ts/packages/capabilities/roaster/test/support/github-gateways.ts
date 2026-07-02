import type { RoasterResult } from "../../src/core/failures.ts";
import { FakeRoasterGitHubGateway, type GitHubGatewayOptions } from "../../src/gateways/github.ts";
import type { PRDiscussionComment } from "../../src/core/models.ts";

export class FailingDiscussionGateway extends FakeRoasterGitHubGateway {
	override async addPrDiscussionComment(
		_prNumber: number,
		_body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		return {
			type: "error",
			error: { type: "github-cli-failed", message: "discussion write failed" },
		};
	}
}
