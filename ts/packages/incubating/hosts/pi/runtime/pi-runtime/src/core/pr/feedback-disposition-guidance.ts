export type FeedbackDispositionScope = "single-pr" | "stack";

interface FeedbackDispositionScopePolicy {
	primaryBatch: string;
	placement: string;
}

const SCOPE_POLICIES = {
	"single-pr": {
		primaryBatch:
			"Primary batch — group mechanical, behavior-preserving fixes for the current PR branch, landing as a separate follow-up commit after approval; do not amend or rewrite existing commits unless the user explicitly requests it or a documented workflow requires commit replacement.",
		placement:
			"Propose each design-bearing change as a single-thesis split-out, with a build-now-versus-defer rationale.",
	},
	stack: {
		primaryBatch:
			"Primary batch — default mechanical, behavior-preserving fixes to one omnibus follow-up PR.",
		placement:
			"For the omnibus and every single-thesis split-out, include placement and build-now-versus-defer rationale. Surface stack tip versus mid-stack placement for confirmation rather than choosing silently.",
	},
} as const satisfies Record<FeedbackDispositionScope, FeedbackDispositionScopePolicy>;

const NO_POLLING_PARAGRAPH =
	"Do not wait for or poll CI, Graphite mergeability, automated review jobs, or newly generated feedback. Re-download feedback only when the user explicitly requests another pass or invokes a stack-repair/checks workflow. The `code-fix-gh-stack` workflow owns waiting, re-querying checks, and iterative repair.";

export function buildFeedbackDispositionGuidance(scope: FeedbackDispositionScope): string {
	const policy = SCOPE_POLICIES[scope];
	return [
		"## Addressing workflow boundary",
		"",
		"Propose a disposition plan for this feedback now, even if the user only submitted this report. First summarize the feedback and likely implementation impact, then suggest coherent change batches. Identify likely code, test, and documentation impacts where the report and repository inspection support them.",
		"",
		"Account for every feedback item under exactly one disposition. Show counts and a concise category line for every non-empty group:",
		`- ${policy.primaryBatch}`,
		"- Split-out — propose one single-thesis design-bearing change per PR.",
		"- Decline — itemize each declined item and explain whether it is verifiably stale or already fixed, or a judgment call; flag judgment calls so the user can override them.",
		"- Defer — itemize each deferred item and explain why it is outside the immediate batch.",
		`- ${policy.placement}`,
		"",
		"Ask the user to confirm, revise the plan, or do something else. Wait for explicit approval before editing or mutating GitHub, including committing, submitting, replying, or resolving threads. This download authorizes analysis and planning only.",
		"",
		"Treat this download as one snapshot, then stop and report.",
		"",
		NO_POLLING_PARAGRAPH,
	].join("\n");
}
