import { DEFAULT_FAST_MODEL } from "@nseng-ai/foundation/model-slug";
import { createDeferred, type Deferred } from "@nseng-ai/foundation/test-kit";
import type {
	CallPiModelTextOptions,
	PiModelRegistryLike,
	PiModelTextResult,
	callPiModelText,
} from "@nseng-ai/pi/models/call";
import { describe, expect, it } from "vitest";

import { createStackEnrichmentEngine } from "../../src/stack-view/enrichment-engine.ts";
import { checkEnrichmentKey, threadEnrichmentKey } from "../../src/stack-view/enrichment-keys.ts";
import {
	createEnrichmentStore,
	type EnrichmentStore,
} from "../../src/stack-view/enrichment-store.ts";
import type { CommandExecApi, ExecOptions } from "../../src/stack-view/exec.ts";
import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "../../src/stack-view/types.ts";

const CWD = "/repo";
const ACTIONS_URL = "https://github.com/o/r/actions/runs/123/job/456";

// ---------------------------------------------------------------------------
// Fakes: a scripted model-call seam and a scripted exec seam. No real I/O.
// ---------------------------------------------------------------------------

interface RecordedModelCall {
	options: CallPiModelTextOptions;
	deferred: Deferred<PiModelTextResult>;
}

interface FakeModel {
	fn: typeof callPiModelText;
	calls: RecordedModelCall[];
}

/** A callPiModelText fake: records every call, gates each on a deferred, and honors aborts. */
function createFakeModel(): FakeModel {
	const calls: RecordedModelCall[] = [];
	const fn: typeof callPiModelText = async (options) => {
		const deferred = createDeferred<PiModelTextResult>();
		calls.push({ options, deferred });
		return await new Promise<PiModelTextResult>((resolve) => {
			void deferred.promise.then(resolve);
			options.signal?.addEventListener(
				"abort",
				() => resolve({ ok: false, reason: "aborted", message: null }),
				{ once: true },
			);
		});
	};
	return { fn, calls };
}

interface RecordedExecCall {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
}

interface FakeExec {
	api: CommandExecApi;
	calls: RecordedExecCall[];
}

interface ExitedResultOverrides {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code?: number | null;
	readonly signal?: string | null;
}

function fakeExec(overrides: ExitedResultOverrides): FakeExec {
	const calls: RecordedExecCall[] = [];
	const api: CommandExecApi = {
		async exec(command, args, options) {
			calls.push({ command, args: [...args], options });
			return {
				type: "exited",
				stdout: overrides.stdout ?? "",
				stderr: overrides.stderr ?? "",
				code: overrides.code ?? 0,
				signal: overrides.signal ?? null,
			};
		},
	};
	return { api, calls };
}

/** An exec seam that must never be called; fails loudly if it is. */
function unusedExec(): CommandExecApi {
	return {
		async exec(command) {
			throw new Error(`exec should not be called, but got: ${command}`);
		},
	};
}

function fakeRegistry(): PiModelRegistryLike {
	return {
		find: () => undefined,
		getApiKeyAndHeaders: async () => ({ ok: false, error: "unused" }),
	};
}

// ---------------------------------------------------------------------------
// Domain fixture builders.
// ---------------------------------------------------------------------------

function makeThread(overrides: Partial<StackViewThreadDetail>): StackViewThreadDetail {
	return {
		id: "thread-id",
		path: "src/foo.ts",
		line: 10,
		author: "reviewer",
		comments: [{ id: "c1", author: "reviewer", body: "please fix", createdAt: null }],
		lastCommentId: "c1",
		totalComments: 1,
		...overrides,
	};
}

function makeCheck(overrides: Partial<StackViewCheckEntry>): StackViewCheckEntry {
	return {
		name: "typescript",
		workflowName: "ci",
		bucket: "failing",
		status: "COMPLETED",
		conclusion: "FAILURE",
		detailsUrl: ACTIONS_URL,
		identity: "ci/typescript",
		...overrides,
	};
}

function makePr(overrides: Partial<StackViewPr>): StackViewPr {
	return {
		branch: "feature",
		parentBranch: "main",
		number: 42,
		title: "A PR",
		url: "",
		graphiteUrl: "",
		isDraft: false,
		body: "",
		threads: { resolved: 0, total: 0 },
		checks: { passing: 0, failing: 0, pending: 0, total: 0 },
		checkEntries: [],
		unresolvedThreads: [],
		status: "unresolved",
		objectiveSlugs: [],
		...overrides,
	};
}

function modelOf(prs: StackViewPr[]): StackViewModel {
	return {
		trunk: "main",
		currentBranch: "feature",
		prs,
		owner: "o",
		repo: "r",
		objectivesBySlug: new Map(),
	};
}

async function flushPromises(): Promise<void> {
	for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function requireThreadKey(thread: StackViewThreadDetail): string {
	const key = threadEnrichmentKey(thread);
	if (key === null) throw new Error("expected a non-null thread key");
	return key;
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("stack enrichment engine", () => {
	it("queues thread and failing-check tasks, marks pending, skips keyless and memoized keys", () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const keyless = makeThread({ id: null });
		const check = makeCheck({
			identity: "ci/typescript",
			conclusion: "FAILURE",
			detailsUrl: "https://github.com/o/r/actions/runs/123/job/456",
		});
		const seededThread = makeThread({ id: "seed", lastCommentId: "s1" });
		const seededCheck = makeCheck({
			identity: "ci/lint",
			conclusion: "FAILURE",
			detailsUrl: "https://github.com/o/r/actions/runs/123/job/789",
		});

		const threadKey = requireThreadKey(thread);
		const checkKey = checkEnrichmentKey(check);
		const seededThreadKey = requireThreadKey(seededThread);
		const seededCheckKey = checkEnrichmentKey(seededCheck);
		// Seed both a ready and a pending entry: memoized terminal/in-flight states
		// are skipped by the enqueue path. (A `failed` seed is deliberately not used
		// here — those are retried once; see the transient-retry test.)
		store.set(seededThreadKey, { state: "ready", summary: "done" });
		store.set(seededCheckKey, { state: "pending" });

		let changes = 0;
		const engine = createStackEnrichmentEngine({
			store,
			execApi: fakeExec({ stdout: "log" }).api,
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});
		engine.onChange(() => {
			changes += 1;
		});

		engine.ensureRow(
			makePr({
				unresolvedThreads: [thread, keyless, seededThread],
				checkEntries: [check, seededCheck],
			}),
		);

		expect(store.get(threadKey)).toEqual({ state: "pending" });
		expect(store.get(checkKey)).toEqual({ state: "pending" });
		// Memoized entries are left untouched.
		expect(store.get(seededThreadKey)).toEqual({ state: "ready", summary: "done" });
		expect(store.get(seededCheckKey)).toEqual({ state: "pending" });
		// Exactly two new tasks were queued (thread + check); one onChange each.
		expect(changes).toBe(2);

		engine.abort();
	});

	it("honors the concurrency cap", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const threads = [0, 1, 2, 3].map((index) =>
			makeThread({ id: `t${index}`, lastCommentId: `c${index}` }),
		);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
			maxConcurrent: 3,
		});

		engine.ensureRow(makePr({ unresolvedThreads: threads }));
		await flushPromises();

		expect(model.calls).toHaveLength(3);

		model.calls[0]?.deferred.resolve({ ok: true, text: "summary" });
		await flushPromises();

		expect(model.calls).toHaveLength(4);
		engine.abort();
	});

	it("records a trimmed summary on success and passes model options through", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const threadKey = requireThreadKey(thread);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		const done = engine.ensureAll(modelOf([makePr({ unresolvedThreads: [thread] })]));
		await flushPromises();

		const options = model.calls[0]?.options;
		expect(options?.provider).toBe(DEFAULT_FAST_MODEL.provider);
		expect(options?.modelId).toBe(DEFAULT_FAST_MODEL.modelId);
		expect(options?.reasoning).toBe("minimal");
		expect(options?.maxTokens).toBe(96);
		// The composed task signal is the single deadline; no fresh model-call timeout.
		expect(options?.timeoutMs).toBeUndefined();
		expect(options?.systemPrompt.length).toBeGreaterThan(0);
		expect(options?.userText).toContain("please fix");

		model.calls[0]?.deferred.resolve({ ok: true, text: "  needs a rename  " });
		await done;

		expect(store.get(threadKey)).toEqual({ state: "ready", summary: "needs a rename" });
	});

	it("marks a thread failed when the model is not ok", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const threadKey = requireThreadKey(thread);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		const done = engine.ensureAll(modelOf([makePr({ unresolvedThreads: [thread] })]));
		await flushPromises();
		model.calls[0]?.deferred.resolve({ ok: false, reason: "request-failed", message: "boom" });
		await done;

		expect(store.get(threadKey)).toEqual({ state: "failed" });
	});

	it("fails an unavailable check immediately without calling exec", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const exec = fakeExec({ stdout: "log" });
		const check = makeCheck({ status: "IN_PROGRESS", conclusion: null, identity: "ci/pending" });
		const checkKey = checkEnrichmentKey(check);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: exec.api,
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		await engine.ensureAll(modelOf([makePr({ checkEntries: [check] })]));

		expect(store.get(checkKey)).toEqual({ state: "failed" });
		expect(exec.calls).toHaveLength(0);
		expect(model.calls).toHaveLength(0);
	});

	it("fails a check when the log fetch fails", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const exec = fakeExec({ code: 1, stderr: "no logs" });
		const check = makeCheck({ identity: "ci/logfail" });
		const checkKey = checkEnrichmentKey(check);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: exec.api,
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		await engine.ensureAll(modelOf([makePr({ checkEntries: [check] })]));

		expect(exec.calls).toHaveLength(1);
		expect(store.get(checkKey)).toEqual({ state: "failed" });
		expect(model.calls).toHaveLength(0);
	});

	it("summarizes a check through gh run view then the model", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const exec = fakeExec({ stdout: "the failing log" });
		const check = makeCheck({ identity: "ci/success" });
		const checkKey = checkEnrichmentKey(check);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: exec.api,
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		const done = engine.ensureAll(modelOf([makePr({ checkEntries: [check] })]));
		await flushPromises();

		expect(exec.calls[0]?.command).toBe("gh");
		expect(exec.calls[0]?.args).toEqual(["run", "view", "123", "--job", "456", "--log"]);
		expect(model.calls[0]?.options.maxTokens).toBe(200);
		expect(model.calls[0]?.options.timeoutMs).toBeUndefined();
		expect(model.calls[0]?.options.userText).toContain("the failing log");

		model.calls[0]?.deferred.resolve({ ok: true, text: "lint failed" });
		await done;

		expect(store.get(checkKey)).toEqual({ state: "ready", summary: "lint failed" });
	});

	it("degrades stickily on a systemic model failure and keeps the first reason", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const exec = fakeExec({ stdout: "log" });
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const check = makeCheck({ identity: "ci/typescript" });
		const threadKey = requireThreadKey(thread);
		const checkKey = checkEnrichmentKey(check);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: exec.api,
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
			maxConcurrent: 2,
		});

		const done = engine.ensureAll(
			modelOf([makePr({ unresolvedThreads: [thread], checkEntries: [check] })]),
		);
		await flushPromises();
		expect(model.calls).toHaveLength(2);

		// First systemic failure flips the engine to a sticky degraded state.
		model.calls[0]?.deferred.resolve({ ok: false, reason: "auth", message: "invalid key" });
		await flushPromises();
		const firstReason = engine.degradedReason();
		expect(firstReason).not.toBeNull();
		expect(firstReason).toContain("invalid key");

		// A second, differing systemic failure does not overwrite the first reason.
		model.calls[1]?.deferred.resolve({ ok: false, reason: "empty-auth", message: "no key" });
		await done;

		expect(engine.degradedReason()).toBe(firstReason);
		expect(store.get(threadKey)).toEqual({ state: "failed" });
		expect(store.get(checkKey)).toEqual({ state: "failed" });
	});

	it("retries a transient failure once per engine, then stops", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const threadKey = requireThreadKey(thread);
		const pr = makePr({ unresolvedThreads: [thread] });
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		// First pass fails transiently.
		const firstDone = engine.ensureAll(modelOf([pr]));
		await flushPromises();
		expect(model.calls).toHaveLength(1);
		model.calls[0]?.deferred.resolve({ ok: false, reason: "request-failed", message: "boom" });
		await firstDone;
		expect(store.get(threadKey)).toEqual({ state: "failed" });
		expect(engine.degradedReason()).toBeNull();

		// Second pass on the SAME engine re-queues the failed key exactly once.
		const secondDone = engine.ensureAll(modelOf([pr]));
		await flushPromises();
		expect(model.calls).toHaveLength(2);
		model.calls[1]?.deferred.resolve({ ok: false, reason: "request-failed", message: "boom" });
		await secondDone;
		expect(store.get(threadKey)).toEqual({ state: "failed" });

		// A third pass does not re-queue: the one retry per failed key is spent.
		await engine.ensureAll(modelOf([pr]));
		await flushPromises();
		expect(model.calls).toHaveLength(2);

		engine.abort();
	});

	it("does not re-queue rows once degraded", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const pr = makePr({ unresolvedThreads: [thread] });
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		// A systemic auth failure both fails the entry and sets degraded.
		const done = engine.ensureAll(modelOf([pr]));
		await flushPromises();
		model.calls[0]?.deferred.resolve({ ok: false, reason: "auth", message: "nope" });
		await done;
		expect(engine.degradedReason()).not.toBeNull();

		// Re-entering the same row produces no new model calls while degraded.
		await engine.ensureAll(modelOf([pr]));
		engine.ensureRow(pr);
		await flushPromises();
		expect(model.calls).toHaveLength(1);

		engine.abort();
	});

	it("deletes only pending entries on abort while ready and failed persist, and ensureAll resolves", async () => {
		const store: EnrichmentStore = createEnrichmentStore();
		const model = createFakeModel();
		const thread = makeThread({ id: "a", lastCommentId: "a1" });
		const threadKey = requireThreadKey(thread);
		const readyKey = "external:ready";
		const failedKey = "external:failed";
		store.set(readyKey, { state: "ready", summary: "kept" });
		store.set(failedKey, { state: "failed" });

		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		const done = engine.ensureAll(modelOf([makePr({ unresolvedThreads: [thread] })]));
		await flushPromises();
		expect(store.get(threadKey)).toEqual({ state: "pending" });
		expect(engine.progress()).toEqual({ done: 0, total: 1 });

		engine.abort();

		expect(store.get(threadKey)).toBeUndefined();
		expect(store.get(readyKey)).toEqual({ state: "ready", summary: "kept" });
		expect(store.get(failedKey)).toEqual({ state: "failed" });
		// The evicted pending task counts as done, so progress() reads complete.
		expect(engine.progress()).toEqual({ done: 1, total: 1 });

		await expect(done).resolves.toBeUndefined();
	});

	it("is single-use after abort: ensureRow is a no-op and ensureAll resolves without queueing", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
		});

		engine.abort();

		const laterThread = makeThread({ id: "later", lastCommentId: "l1" });
		const laterThreadKey = requireThreadKey(laterThread);
		const laterPr = makePr({ unresolvedThreads: [laterThread] });

		engine.ensureRow(laterPr);
		await flushPromises();
		expect(store.get(laterThreadKey)).toBeUndefined();

		await expect(engine.ensureAll(modelOf([laterPr]))).resolves.toBeUndefined();
		expect(store.get(laterThreadKey)).toBeUndefined();
		expect(model.calls).toHaveLength(0);
		// Nothing was ever queued on this aborted engine.
		expect(engine.progress()).toBeNull();
	});

	it("settles a check failed when exec rejects and leaves the worker slot usable", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const rejectingExec: CommandExecApi = {
			async exec() {
				throw new Error("spawn gh ENOENT");
			},
		};
		const check = makeCheck({ identity: "ci/reject" });
		const checkKey = checkEnrichmentKey(check);
		const engine = createStackEnrichmentEngine({
			store,
			execApi: rejectingExec,
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
			maxConcurrent: 1,
		});

		// A rejecting exec must not throw out of the worker loop: the check settles
		// failed and ensureAll resolves.
		await expect(
			engine.ensureAll(modelOf([makePr({ checkEntries: [check] })])),
		).resolves.toBeUndefined();
		expect(store.get(checkKey)).toEqual({ state: "failed" });
		expect(model.calls).toHaveLength(0);

		// The single worker slot was not stranded: a subsequent task still runs.
		const thread = makeThread({ id: "after", lastCommentId: "a1" });
		const threadKey = requireThreadKey(thread);
		engine.ensureRow(makePr({ unresolvedThreads: [thread] }));
		await flushPromises();
		expect(model.calls).toHaveLength(1);

		model.calls[0]?.deferred.resolve({ ok: true, text: "recovered" });
		await flushPromises();
		expect(store.get(threadKey)).toEqual({ state: "ready", summary: "recovered" });

		engine.abort();
	});

	it("reports progress across mixed outcomes", async () => {
		const store = createEnrichmentStore();
		const model = createFakeModel();
		const okThread = makeThread({ id: "ok", lastCommentId: "o1" });
		const failThread = makeThread({ id: "fail", lastCommentId: "f1" });
		const engine = createStackEnrichmentEngine({
			store,
			execApi: unusedExec(),
			cwd: CWD,
			registry: fakeRegistry(),
			callModelText: model.fn,
			maxConcurrent: 2,
		});

		expect(engine.progress()).toBeNull();

		const done = engine.ensureAll(modelOf([makePr({ unresolvedThreads: [okThread, failThread] })]));
		await flushPromises();
		expect(engine.progress()).toEqual({ done: 0, total: 2 });

		model.calls[0]?.deferred.resolve({ ok: true, text: "summary" });
		model.calls[1]?.deferred.resolve({ ok: false, reason: "request-failed", message: null });
		await done;

		expect(engine.progress()).toEqual({ done: 2, total: 2 });
	});
});
