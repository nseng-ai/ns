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
		...(fixture.conclusion === undefined ? {} : { conclusion: fixture.conclusion }),
		...(fixture.startedAt === undefined ? {} : { startedAt: fixture.startedAt }),
		...(fixture.completedAt === undefined ? {} : { completedAt: fixture.completedAt }),
		checkSuite: { workflowRun: { workflow: { name: fixture.workflowName } } },
	};
}
