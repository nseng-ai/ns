import type { ComposeViewPort } from "../../src/stack-view/compose-controller.ts";
import type { ComposeTranscriptState } from "../../src/stack-view/compose-transcript.ts";
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

export interface FakeComposePort {
	port: ComposeViewPort;
	sendCalls: string[];
	abortCalls: () => number;
	setTranscript(state: ComposeTranscriptState): void;
	setDraft(draft: string | null): void;
	setUnavailableReason(reason: string | null): void;
}

/** A scripted {@link ComposeViewPort}: settable state, records send/abortTurn. */
export function createFakeComposePort(options: { draft?: string | null } = {}): FakeComposePort {
	let transcript: ComposeTranscriptState = { entries: [], isStreaming: false };
	let draft: string | null = options.draft ?? null;
	let unavailableReason: string | null = null;
	const sendCalls: string[] = [];
	let abortCalls = 0;
	const port: ComposeViewPort = {
		get transcript() {
			return transcript;
		},
		get draft() {
			return draft;
		},
		get unavailableReason() {
			return unavailableReason;
		},
		send: async (text) => {
			sendCalls.push(text);
		},
		abortTurn: async () => {
			abortCalls += 1;
		},
	};
	return {
		port,
		sendCalls,
		abortCalls: () => abortCalls,
		setTranscript: (state) => {
			transcript = state;
		},
		setDraft: (value) => {
			draft = value;
		},
		setUnavailableReason: (reason) => {
			unavailableReason = reason;
		},
	};
}

export interface FakeComposeControllerHandle {
	handle: ComposeViewPort & { dispose(): void };
	disposeCalls: () => number;
}

export function createFakeComposeControllerHandle(
	options: { draft?: string | null } = {},
): FakeComposeControllerHandle {
	const transcript: ComposeTranscriptState = { entries: [], isStreaming: false };
	const draft = options.draft ?? null;
	let disposeCalls = 0;
	return {
		handle: {
			get transcript() {
				return transcript;
			},
			get draft() {
				return draft;
			},
			get unavailableReason() {
				return null;
			},
			send: async () => {},
			abortTurn: async () => {},
			dispose: () => {
				disposeCalls += 1;
			},
		},
		disposeCalls: () => disposeCalls,
	};
}
