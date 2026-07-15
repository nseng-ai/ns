import type { PublicationCommitFacts, PublicationTargetFacts } from "./contracts.ts";

export interface PublicationFactsError {
	code: string;
	message: string;
}

export type PublicationFactsResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: PublicationFactsError };

export type PublicationTargetFactsResult =
	| { type: "found"; value: PublicationTargetFacts }
	| { type: "missing" }
	| { type: "error"; error: PublicationFactsError };

/**
 * Consumer Gateway for the read-only Git and existing-PR facts required by
 * Objective Runner publication policy. Implementations must not mutate either
 * system; Flow remains the owner of later publication effects.
 */
export interface ObjectiveRunnerPublicationFactsGateway {
	readPublicationTarget(input: { repoRoot: string }): Promise<PublicationTargetFactsResult>;
	readPublicationCommits(input: {
		repoRoot: string;
		lastPublishedHead: string;
		intendedPublishedHead: string;
	}): Promise<PublicationFactsResult<PublicationCommitFacts>>;
}
