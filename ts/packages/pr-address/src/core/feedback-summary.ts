import type { GithubPrDiscussionComment } from "@asdl/core/github-pr-feedback";

const BODY_MARKERS: ReadonlyArray<readonly [marker: string, label: string]> = [
	["<!-- roaster:", "roaster_marker"],
	["<!-- asdl-reviewer:", "asdl_reviewer_marker"],
	["[vc]:", "vercel_marker"],
	["app.graphite.com/github/pr/", "graphite_link"],
	["static.graphite.dev", "graphite_static_asset"],
];

export function isAutomationLikeDiscussionComment(comment: GithubPrDiscussionComment): boolean {
	return sourceEvidence(comment.author, comment.body).length > 0;
}

function sourceEvidence(author: string, body: string): string[] {
	const evidence: string[] = author.endsWith("[bot]") ? ["bot_author"] : [];
	for (const [marker, label] of BODY_MARKERS) {
		if (body.includes(marker)) evidence.push(label);
	}
	return evidence;
}
