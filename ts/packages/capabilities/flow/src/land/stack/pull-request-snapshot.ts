import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { PullRequestSnapshot } from "./types.ts";

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
