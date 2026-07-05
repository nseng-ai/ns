import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";

export function checkEntryFixture(
	overrides: Partial<StackViewCheckEntry> = {},
): StackViewCheckEntry {
	return {
		name: "check",
		workflowName: null,
		bucket: "passing",
		status: null,
		conclusion: null,
		detailsUrl: null,
		identity: null,
		...overrides,
	};
}

export function threadDetailFixture(
	overrides: Partial<StackViewThreadDetail> = {},
): StackViewThreadDetail {
	return {
		id: null,
		path: "",
		line: null,
		author: null,
		comments: [],
		lastCommentId: null,
		totalComments: 0,
		...overrides,
	};
}

export function stackViewPrFixture(overrides: Partial<StackViewPr> = {}): StackViewPr {
	return {
		branch: "feature/1",
		parentBranch: "main",
		number: 1,
		title: "First PR",
		url: "https://github.com/acme/widgets/pull/1",
		graphiteUrl: "https://app.graphite.dev/pr/1",
		isDraft: false,
		body: "Body text",
		threads: { resolved: 0, total: 0 },
		checks: { passing: 0, failing: 0, pending: 0, total: 0 },
		checkEntries: [],
		unresolvedThreads: [],
		status: "ready",
		objectiveSlugs: [],
		...overrides,
	};
}

export function stackViewModelFixture(overrides: Partial<StackViewModel> = {}): StackViewModel {
	return {
		trunk: "main",
		currentBranch: "feature/1",
		prs: [stackViewPrFixture()],
		owner: "acme",
		repo: "widgets",
		objectivesBySlug: new Map(),
		...overrides,
	};
}
