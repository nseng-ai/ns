import type { ComposeViewPort } from "../../src/stack-view/compose-controller.ts";
import type { ComposeTranscriptState } from "../../src/stack-view/compose-transcript.ts";
import type { ComposeControllerHandle } from "../../src/stack-view/extension.ts";
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
	/** Notify every attached onChange listener, mirroring a controller state transition. */
	fireOnChange(): void;
}

interface ComposeViewPortState {
	transcript: ComposeTranscriptState;
	draft: string | null;
	unavailableReason: string | null;
}

function buildComposeViewPort(options: {
	state: () => ComposeViewPortState;
	send: (text: string) => Promise<void>;
	abortTurn: () => Promise<void>;
	onChange: (listener: () => void) => () => void;
}): ComposeViewPort {
	return {
		get transcript() {
			return options.state().transcript;
		},
		get draft() {
			return options.state().draft;
		},
		get unavailableReason() {
			return options.state().unavailableReason;
		},
		send: options.send,
		abortTurn: options.abortTurn,
		onChange: options.onChange,
	};
}

/** A scripted {@link ComposeViewPort}: settable state, records send/abortTurn, drives onChange. */
export function createFakeComposePort(): FakeComposePort {
	let transcript: ComposeTranscriptState = { entries: [], isStreaming: false };
	let draft: string | null = null;
	let unavailableReason: string | null = null;
	const sendCalls: string[] = [];
	let abortCalls = 0;
	const listeners = new Set<() => void>();
	const port = buildComposeViewPort({
		state: () => ({ transcript, draft, unavailableReason }),
		send: async (text) => {
			sendCalls.push(text);
		},
		abortTurn: async () => {
			abortCalls += 1;
		},
		onChange: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	});
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
		fireOnChange: () => {
			for (const listener of listeners) listener();
		},
	};
}

export interface FakeComposeControllerHandle {
	handle: ComposeControllerHandle;
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
			...buildComposeViewPort({
				state: () => ({ transcript, draft, unavailableReason: null }),
				send: async () => {},
				abortTurn: async () => {},
				onChange: () => () => {},
			}),
			dispose: () => {
				disposeCalls += 1;
			},
		},
		disposeCalls: () => disposeCalls,
	};
}
