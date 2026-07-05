import { describe, expect, test } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

import { ComposeController } from "../../src/stack-view/compose-controller.ts";
import type {
	ComposeAskResult,
	ComposeSession,
	ComposeSessionFactory,
	CreateComposeSessionResult,
} from "../../src/stack-view/compose-session.ts";
import type { ComposeSessionEvent } from "../../src/stack-view/compose-transcript.ts";
import type { StackEnrichmentPort } from "../../src/stack-view/enrichment-engine.ts";
import type { EnrichmentEntry } from "../../src/stack-view/enrichment-store.ts";
import type {
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";

const TEST_MODEL: Model<Api> = {
	id: "m",
	name: "test model",
	api: "anthropic-messages",
	provider: "p",
	baseUrl: "https://example.invalid",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100_000,
	maxTokens: 4_096,
};

function createTestModelRegistry(): ModelRegistry {
	return ModelRegistry.inMemory(AuthStorage.inMemory());
}

/** Flush the microtask queue enough times to drain the controller's await chain. */
async function flushPromises(): Promise<void> {
	for (let i = 0; i < 25; i += 1) await Promise.resolve();
}

interface Deferred {
	promise: Promise<void>;
	release: () => void;
}

function deferred(): Deferred {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

function makeThread(id: string): StackViewThreadDetail {
	return {
		id,
		path: "src/foo.ts",
		line: 12,
		author: "reviewer",
		comments: [{ id: `${id}-c1`, author: "reviewer", body: "please fix", createdAt: null }],
		lastCommentId: `${id}-c1`,
		totalComments: 1,
	};
}

function makePr(overrides: Partial<StackViewPr> = {}): StackViewPr {
	return {
		branch: "feature-a",
		parentBranch: "main",
		number: 42,
		title: "Add feature A",
		url: "https://example.invalid/pr/42",
		graphiteUrl: "https://example.invalid/gt/42",
		isDraft: false,
		body: "body",
		threads: { resolved: 0, total: 1 },
		checks: { passing: 1, failing: 0, pending: 0, total: 1 },
		checkEntries: [],
		unresolvedThreads: [makeThread("THREAD-XYZ")],
		status: "unresolved",
		objectiveSlugs: [],
		...overrides,
	};
}

function makeStackModel(): StackViewModel {
	return {
		trunk: "main",
		currentBranch: "feature-a",
		prs: [makePr()],
		owner: "acme-owner",
		repo: "widget-repo",
		objectivesBySlug: new Map(),
	};
}

class FakeComposeSession implements ComposeSession {
	private readonly askResult: ComposeAskResult;
	private readonly gate: Promise<void> | null;
	private readonly defaultEvents: readonly ComposeSessionEvent[];
	private readonly eventsPerAsk: Array<readonly ComposeSessionEvent[]>;
	private listeners: Array<(event: ComposeSessionEvent) => void> = [];
	private readonly asks: string[] = [];
	private aborts = 0;
	private isDisposedValue = false;

	constructor(
		options: {
			events?: readonly ComposeSessionEvent[];
			eventsPerAsk?: ReadonlyArray<readonly ComposeSessionEvent[]>;
			askResult?: ComposeAskResult;
			gate?: Promise<void>;
		} = {},
	) {
		this.askResult = options.askResult ?? { ok: true };
		this.gate = options.gate ?? null;
		this.defaultEvents = options.events ?? [];
		this.eventsPerAsk = (options.eventsPerAsk ?? []).map((events) => [...events]);
	}

	get askLog(): readonly string[] {
		return [...this.asks];
	}

	get abortCount(): number {
		return this.aborts;
	}

	get isDisposed(): boolean {
		return this.isDisposedValue;
	}

	/** Directly push an event to current subscribers (used to prove no post-dispose leak). */
	emit(event: ComposeSessionEvent): void {
		for (const listener of this.listeners) listener(event);
	}

	subscribe(listener: (event: ComposeSessionEvent) => void): () => void {
		this.listeners = [...this.listeners, listener];
		return () => {
			this.listeners = this.listeners.filter((candidate) => candidate !== listener);
		};
	}

	async ask(text: string): Promise<ComposeAskResult> {
		this.asks.push(text);
		if (this.gate !== null) await this.gate;
		const events =
			this.eventsPerAsk.length > 0 ? (this.eventsPerAsk.shift() ?? []) : this.defaultEvents;
		for (const event of events) {
			for (const listener of this.listeners) listener(event);
		}
		return this.askResult;
	}

	async abortTurn(): Promise<void> {
		this.aborts += 1;
	}

	dispose(): void {
		this.isDisposedValue = true;
	}
}

class FakeComposeSessionFactory implements ComposeSessionFactory {
	private readonly result: CreateComposeSessionResult;
	private readonly gate: Promise<void> | null;
	private readonly calls: Array<{ cwd: string; systemPrompt: string }> = [];

	constructor(options: { result?: CreateComposeSessionResult; gate?: Promise<void> } = {}) {
		this.result = options.result ?? { ok: true, value: new FakeComposeSession() };
		this.gate = options.gate ?? null;
	}

	get createCalls(): ReadonlyArray<{ cwd: string; systemPrompt: string }> {
		return this.calls.map((call) => ({ ...call }));
	}

	async create(
		options: Parameters<ComposeSessionFactory["create"]>[0],
	): Promise<CreateComposeSessionResult> {
		this.calls.push({ cwd: options.cwd, systemPrompt: options.systemPrompt });
		if (this.gate !== null) await this.gate;
		return this.result;
	}
}

class FakeEnrichmentPort implements StackEnrichmentPort {
	private readonly ensureAllGate: Promise<void> | null;
	private readonly scriptedSnapshot: ReadonlyMap<string, EnrichmentEntry>;
	private currentProgress: { done: number; total: number } | null;
	private readonly listeners = new Set<() => void>();
	private readonly ensureAllModels: StackViewModel[] = [];

	constructor(
		options: {
			ensureAllGate?: Promise<void>;
			snapshot?: ReadonlyMap<string, EnrichmentEntry>;
			initialProgress?: { done: number; total: number } | null;
		} = {},
	) {
		this.ensureAllGate = options.ensureAllGate ?? null;
		this.scriptedSnapshot = options.snapshot ?? new Map();
		this.currentProgress = options.initialProgress ?? null;
	}

	get ensureAllCalls(): readonly StackViewModel[] {
		return [...this.ensureAllModels];
	}

	/** Set scripted progress and notify subscribers, mirroring the real engine's onChange. */
	fireProgress(progress: { done: number; total: number }): void {
		this.currentProgress = progress;
		for (const listener of this.listeners) listener();
	}

	snapshot(): ReadonlyMap<string, EnrichmentEntry> {
		return this.scriptedSnapshot;
	}

	ensureRow(): void {}

	async ensureAll(model: StackViewModel): Promise<void> {
		this.ensureAllModels.push(model);
		if (this.ensureAllGate !== null) await this.ensureAllGate;
	}

	progress(): { done: number; total: number } | null {
		return this.currentProgress;
	}

	degradedReason(): string | null {
		return null;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	abort(): void {}
}

interface Harness {
	controller: ComposeController;
	factory: FakeComposeSessionFactory;
	enrichment: FakeEnrichmentPort;
	changeCount: () => number;
}

function createHarness(
	options: {
		model?: Model<Api>;
		factory?: FakeComposeSessionFactory;
		enrichment?: FakeEnrichmentPort;
	} = {},
): Harness {
	const factory = options.factory ?? new FakeComposeSessionFactory();
	const enrichment = options.enrichment ?? new FakeEnrichmentPort();
	let changes = 0;
	const controller = new ComposeController({
		cwd: "/repo",
		model: options.model ?? TEST_MODEL,
		modelRegistry: createTestModelRegistry(),
		stackModel: makeStackModel(),
		enrichment,
		factory,
	});
	controller.onChange(() => {
		changes += 1;
	});
	return { controller, factory, enrichment, changeCount: () => changes };
}

describe("compose controller", () => {
	test("enriches the stack before spawning and builds the prompt from the fresh snapshot", async () => {
		const ensureAllGate = deferred();
		const enrichment = new FakeEnrichmentPort({ ensureAllGate: ensureAllGate.promise });
		const factory = new FakeComposeSessionFactory();
		const { controller } = createHarness({ enrichment, factory });

		const send = controller.send("draft a summary");
		await flushPromises();

		// ensureAll is gated → factory.create must not have run yet.
		expect(enrichment.ensureAllCalls).toHaveLength(1);
		expect(factory.createCalls).toHaveLength(0);

		ensureAllGate.release();
		await send;

		expect(factory.createCalls).toHaveLength(1);
		// The prompt is built from the model that flowed through, after enrichment.
		expect(factory.createCalls[0]?.systemPrompt).toContain("acme-owner/widget-repo");
		expect(factory.createCalls[0]?.systemPrompt).toContain("THREAD-XYZ");
	});

	test("progress updates rewrite the enriching notice in place", async () => {
		const ensureAllGate = deferred();
		const enrichment = new FakeEnrichmentPort({ ensureAllGate: ensureAllGate.promise });
		const { controller, changeCount } = createHarness({ enrichment });

		const send = controller.send("hi");
		await flushPromises();
		expect(controller.transcript.entries.at(-1)).toEqual({
			kind: "notice",
			text: "enriching stack…",
		});
		const beforeChanges = changeCount();

		enrichment.fireProgress({ done: 1, total: 3 });
		await flushPromises();

		expect(controller.transcript.entries.at(-1)).toEqual({
			kind: "notice",
			text: "enriching stack… 1/3",
		});
		expect(changeCount()).toBeGreaterThan(beforeChanges);

		ensureAllGate.release();
		await send;
	});

	test("onChange listeners stop receiving notifications after unsubscribe", async () => {
		const { controller } = createHarness();
		let calls = 0;
		const unsubscribe = controller.onChange(() => {
			calls += 1;
		});

		await controller.send("first");
		expect(calls).toBeGreaterThan(0);

		const afterFirst = calls;
		unsubscribe();

		// A further transition must not reach the detached listener.
		await controller.send("second");
		expect(calls).toBe(afterFirst);
	});

	test("spawn failure is sticky and does not retry the factory", async () => {
		const factory = new FakeComposeSessionFactory({
			result: { ok: false, code: "spawn-failed", message: "boom" },
		});
		const enrichment = new FakeEnrichmentPort();
		const { controller } = createHarness({ factory, enrichment });

		await controller.send("first");

		expect(controller.unavailableReason).toBe("boom");
		expect(controller.transcript.entries).toContainEqual({
			kind: "notice",
			text: "compose unavailable: boom",
		});

		await controller.send("second");

		expect(factory.createCalls).toHaveLength(1);
		expect(enrichment.ensureAllCalls).toHaveLength(1);
	});

	test("a second send while streaming is rejected with a notice", async () => {
		const askGate = deferred();
		const session = new FakeComposeSession({ gate: askGate.promise });
		const factory = new FakeComposeSessionFactory({ result: { ok: true, value: session } });
		const { controller } = createHarness({ factory });

		const first = controller.send("one");
		await flushPromises();
		expect(controller.transcript.isStreaming).toBe(true);
		expect(session.askLog).toEqual(["one"]);

		await controller.send("two");

		expect(session.askLog).toEqual(["one"]);
		expect(controller.transcript.entries).toContainEqual({
			kind: "notice",
			text: "wait for the current answer or press ctrl+c to abort it",
		});

		askGate.release();
		await first;
		expect(controller.transcript.isStreaming).toBe(false);
	});

	test("assistant-end promotes a draft block and keeps the prior draft when absent", async () => {
		const withDraft: ComposeSessionEvent[] = [
			{ type: "assistant-delta", text: "Here is the reply.\n```draft\nHello world\n```" },
			{ type: "assistant-end" },
		];
		const noDraft: ComposeSessionEvent[] = [
			{ type: "assistant-delta", text: "Just prose, no block." },
			{ type: "assistant-end" },
		];
		const session = new FakeComposeSession({ eventsPerAsk: [withDraft, noDraft] });
		const factory = new FakeComposeSessionFactory({ result: { ok: true, value: session } });
		const { controller } = createHarness({ factory });

		await controller.send("first");
		expect(controller.draft).toBe("Hello world");
		const firstAssistant = controller.transcript.entries.findLast((e) => e.kind === "assistant");
		expect(firstAssistant?.text).toContain("[draft updated");
		expect(firstAssistant?.text).not.toContain("```draft");

		await controller.send("second");
		expect(controller.draft).toBe("Hello world");
		expect(controller.transcript.entries).toContainEqual({
			kind: "notice",
			text: "reply had no draft block — kept previous draft",
		});
	});

	test("a failed ask surfaces a notice and clears streaming", async () => {
		const session = new FakeComposeSession({
			askResult: { ok: false, code: "prompt-failed", message: "nope" },
		});
		const factory = new FakeComposeSessionFactory({ result: { ok: true, value: session } });
		const { controller } = createHarness({ factory });

		await controller.send("x");

		expect(controller.transcript.isStreaming).toBe(false);
		expect(controller.transcript.entries).toContainEqual({
			kind: "notice",
			text: "prompt failed: nope",
		});
	});

	test("dispose during spawn drops the created session and leaks no subscription", async () => {
		const createGate = deferred();
		const session = new FakeComposeSession();
		const factory = new FakeComposeSessionFactory({
			result: { ok: true, value: session },
			gate: createGate.promise,
		});
		const { controller } = createHarness({ factory });

		const send = controller.send("x");
		await flushPromises();
		expect(factory.createCalls).toHaveLength(1);

		controller.dispose();
		createGate.release();
		await send;

		expect(session.isDisposed).toBe(true);
		// Never subscribed → an emitted event must not touch the transcript.
		session.emit({ type: "assistant-delta", text: "leak" });
		expect(controller.transcript.entries).not.toContainEqual({ kind: "assistant", text: "leak" });
	});

	test("dispose during enrichment never spawns and stops touching the view", async () => {
		const ensureAllGate = deferred();
		const enrichment = new FakeEnrichmentPort({ ensureAllGate: ensureAllGate.promise });
		const factory = new FakeComposeSessionFactory();
		const { controller, changeCount } = createHarness({ enrichment, factory });

		const send = controller.send("x");
		await flushPromises();
		expect(enrichment.ensureAllCalls).toHaveLength(1);

		controller.dispose();
		const changesAtDispose = changeCount();
		ensureAllGate.release();
		await send;

		// No session spawn was paid for, and the dead view saw no further repaints.
		expect(factory.createCalls).toHaveLength(0);
		expect(changeCount()).toBe(changesAtDispose);
	});

	test("a send during the spawn window is rejected with a notice, not dropped silently", async () => {
		const ensureAllGate = deferred();
		const enrichment = new FakeEnrichmentPort({ ensureAllGate: ensureAllGate.promise });
		const session = new FakeComposeSession();
		const factory = new FakeComposeSessionFactory({ result: { ok: true, value: session } });
		const { controller } = createHarness({ enrichment, factory });

		const first = controller.send("first");
		await flushPromises();

		await controller.send("second");
		expect(controller.transcript.entries.at(-1)).toEqual({
			kind: "notice",
			text: "still preparing the compose session — send again once it is ready",
		});
		// The rejected send never reached the transcript as a user entry.
		expect(controller.transcript.entries).not.toContainEqual({ kind: "user", text: "second" });

		ensureAllGate.release();
		await first;
		expect(session.askLog).toEqual(["first"]);
	});

	test("abortTurn is a no-op before spawn and passes through afterward", async () => {
		const session = new FakeComposeSession();
		const factory = new FakeComposeSessionFactory({ result: { ok: true, value: session } });
		const { controller } = createHarness({ factory });

		// No session yet: must not throw.
		await controller.abortTurn();
		expect(session.abortCount).toBe(0);

		await controller.send("x");
		await controller.abortTurn();
		expect(session.abortCount).toBe(1);
	});
});
