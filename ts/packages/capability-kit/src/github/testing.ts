import { optionalEntries } from "@nseng-ai/core/primitives";

export interface GithubCheckRunFixture {
	readonly workflowName: string;
	readonly name: string;
	readonly status: string;
	readonly conclusion?: string;
	readonly startedAt?: string;
	readonly completedAt?: string;
}

export function githubCheckRun(fixture: GithubCheckRunFixture): unknown {
	return {
		__typename: "CheckRun",
		name: fixture.name,
		status: fixture.status,
		...optionalEntries({
			conclusion: fixture.conclusion,
			startedAt: fixture.startedAt,
			completedAt: fixture.completedAt,
		}),
		checkSuite: { workflowRun: { workflow: { name: fixture.workflowName } } },
	};
}
