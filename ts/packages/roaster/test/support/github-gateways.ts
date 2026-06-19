import type { RoasterResult } from "../../src/failures.ts";
import { FakeRoasterGitHubGateway, type GitHubGatewayOptions } from "../../src/gateways/github.ts";
import type { PRDiscussionComment } from "../../src/models.ts";

export class FailingDiscussionGateway extends FakeRoasterGitHubGateway {
	override async addPrDiscussionComment(
		_prNumber: number,
		_body: string,
		_options: GitHubGatewayOptions,
	): Promise<RoasterResult<PRDiscussionComment>> {
		return {
			type: "error",
			error: { type: "github_cli_failed", message: "discussion write failed" },
		};
	}
}
