import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { PullRequestFacts, SquashMergeVerification } from "../types.ts";
import type { PullRequestSnapshot } from "./types.ts";

export type SquashMergeVerificationSource = Pick<
	PullRequestFacts,
	"number" | "state" | "mergedAt" | "baseRefName" | "headRefName" | "url"
>;

export function copyPullRequestSnapshot(pr: Readonly<PullRequestSnapshot>): PullRequestSnapshot {
	return {
		id: pr.id,
		number: pr.number,
		title: pr.title,
		body: pr.body,
		state: pr.state,
		isDraft: pr.isDraft,
		headRefName: pr.headRefName,
		baseRefName: pr.baseRefName,
		headRefOid: pr.headRefOid,
		...optionalEntry("mergeStateStatus", pr.mergeStateStatus),
		...optionalEntry("url", pr.url),
		...optionalEntry("mergedAt", pr.mergedAt),
	};
}

export function toSquashMergeVerification(
	source: SquashMergeVerificationSource,
): SquashMergeVerification {
	return {
		number: source.number,
		state: source.state,
		mergedAt: source.mergedAt ?? null,
		baseRefName: source.baseRefName,
		headRefName: source.headRefName,
		...optionalEntry("url", source.url),
	};
}
