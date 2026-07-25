import type {
	GithubPrDiscussionComment,
	GithubPrFeedbackFailure,
} from "@nseng-ai/extension-kit/github/pr-feedback";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/extension-kit/github/testing";
import type { Result } from "@nseng-ai/foundation/result";

export class FailingDiscussionGateway extends FakeGithubPrFeedbackGateway {
	override async addPrDiscussionComment(_params: {
		readonly prNumber: number;
		readonly body: string;
		readonly authorLogin?: string;
	}): Promise<Result<GithubPrDiscussionComment, GithubPrFeedbackFailure>> {
		return {
			ok: false,
			error: {
				code: "github_pr_feedback_gh_failed",
				message: "discussion write failed",
				details: { operation: "addPrDiscussionComment" },
			},
		};
	}
}
