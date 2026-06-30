import { optionalEntry } from "@sdl/core/primitives";

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
		...optionalEntry("conclusion", fixture.conclusion),
		...optionalEntry("startedAt", fixture.startedAt),
		...optionalEntry("completedAt", fixture.completedAt),
		checkSuite: { workflowRun: { workflow: { name: fixture.workflowName } } },
	};
}
