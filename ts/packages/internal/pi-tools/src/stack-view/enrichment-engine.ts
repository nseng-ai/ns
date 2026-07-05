/**
 * The stack-view enrichment engine: the I/O half of the enrichment subsystem. It
 * turns a stack model into background summarization tasks — one per unresolved
 * review thread, one per failing check — drains them through a bounded worker
 * pool, and records each result in the injected {@link EnrichmentStore}. All pure
 * key/store/prompt logic lives in the sibling `enrichment-*` modules; this module
 * owns only the concurrency, cancellation, and external-call plumbing.
 *
 * Memoization: a key already present in the store (`pending`/`ready`/`failed`) is
 * never re-queued, so re-`ensureRow`/`ensureAll` calls are cheap and idempotent.
 *
 * Cancellation: the engine owns one `AbortController`; each task races it against
 * an `AbortSignal.timeout` deadline (no raw timers). `abort()` deletes the
 * engine's still-`pending` entries so a later engine retries them, while `ready`
 * and `failed` results persist.
 *
 * Error model matches the rest of stack-view: a task never throws out of the
 * worker loop; failures are recorded as `{ state: "failed" }`, and `ensureAll`
 * resolves (never rejects) once its tasks settle.
 */
import { DEFAULT_FAST_MODEL } from "@nseng-ai/foundation/model-slug";

import { callPiModelText } from "@nseng-ai/pi/models/call";
import type { PiModelRegistryLike } from "@nseng-ai/pi/models/call";

import { checkLogUnavailableReason, fetchCheckLogTail } from "./check-logs.ts";
import { checkEnrichmentKey, threadEnrichmentKey } from "./enrichment-keys.ts";
import { buildCheckSummaryPrompt, buildThreadSummaryPrompt } from "./enrichment-prompts.ts";
import type { EnrichmentEntry, EnrichmentStore } from "./enrichment-store.ts";
import type { CommandExecApi } from "./exec.ts";
import type {
	StackViewCheckEntry,
	StackViewModel,
	StackViewPr,
	StackViewThreadDetail,
} from "./types.ts";

const DEFAULT_MAX_CONCURRENT = 3;
const THREAD_TASK_TIMEOUT_MS = 30_000;
const THREAD_MAX_TOKENS = 96;
const CHECK_TASK_TIMEOUT_MS = 60_000;
const CHECK_MAX_TOKENS = 200;
const MODEL_REGISTRY_UNAVAILABLE_REASON =
	"Pi model registry is unavailable; summaries are disabled.";

/** A settled enrichment result the engine records (never `pending`). */
type SettledEntry = Extract<EnrichmentEntry, { state: "ready" } | { state: "failed" }>;

/** One unit of background work derived from a stack row. */
type EnrichmentTask =
	| { kind: "thread"; key: string; prNumber: number; thread: StackViewThreadDetail }
	| { kind: "check"; key: string; entry: StackViewCheckEntry };

/**
 * The enrichment engine's control surface. An engine is single-use after
 * {@link StackEnrichmentPort.abort}: once aborted the controller stays aborted,
 * so `ensureRow` becomes a no-op and `ensureAll` resolves immediately without
 * queueing. Create a fresh engine to enrich again.
 */
export interface StackEnrichmentPort {
	snapshot(): ReadonlyMap<string, EnrichmentEntry>;
	/** Fire-and-forget: queue this row's tasks and start draining. No-op after abort(). */
	ensureRow(pr: StackViewPr): void;
	/**
	 * Queue every row's tasks; resolves when all queued work has settled.
	 * Resolves immediately (queueing nothing) after abort().
	 */
	ensureAll(model: StackViewModel): Promise<void>;
	/**
	 * Progress across all work queued this engine; null before anything is queued.
	 * abort() counts each evicted still-pending task as done, so progress reaches
	 * `done === total` (monotonic — done only rises) once aborted.
	 */
	progress(): { done: number; total: number } | null;
	/** Sticky reason the engine is degraded (e.g. model registry unavailable); null otherwise. */
	degradedReason(): string | null;
	/** Subscribe to entry-state transitions; returns an unsubscribe function. */
	onChange(listener: () => void): () => void;
	/** Cancel in-flight work and evict this engine's still-pending entries. Renders the engine single-use. */
	abort(): void;
}

export interface CreateStackEnrichmentEngineOptions {
	store: EnrichmentStore;
	execApi: CommandExecApi;
	cwd: string;
	registry: PiModelRegistryLike | undefined;
	/** Test seam; defaults to the real {@link callPiModelText}. */
	callModelText?: typeof callPiModelText;
	maxConcurrent?: number;
}

export function createStackEnrichmentEngine(
	options: CreateStackEnrichmentEngineOptions,
): StackEnrichmentPort {
	const { store, execApi, cwd, registry } = options;
	const callModelText = options.callModelText ?? callPiModelText;
	const maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT);

	const controller = new AbortController();
	const listeners = new Set<() => void>();
	const queue: EnrichmentTask[] = [];
	// Keys this engine set to `pending` and has not yet settled; the eviction set
	// for abort() so we only drop pending entries this engine owns.
	const pendingKeys = new Set<string>();
	const idleWaiters: Array<() => void> = [];

	let activeWorkers = 0;
	let totalQueued = 0;
	let doneCount = 0;
	let degraded: string | null = null;

	function emitChange(): void {
		// Snapshot first: a listener may unsubscribe (mutating the set) during emit.
		const snapshot = [...listeners];
		for (const listener of snapshot) listener();
	}

	function rowTasks(pr: StackViewPr): EnrichmentTask[] {
		const tasks: EnrichmentTask[] = [];
		if (pr.number !== null) {
			for (const thread of pr.unresolvedThreads) {
				const key = threadEnrichmentKey(thread);
				if (key === null) continue; // keyless thread: never summarized.
				tasks.push({ kind: "thread", key, prNumber: pr.number, thread });
			}
		}
		for (const entry of pr.checkEntries) {
			if (entry.bucket !== "failing") continue;
			tasks.push({ kind: "check", key: checkEnrichmentKey(entry), entry });
		}
		return tasks;
	}

	function enqueueRowTasks(pr: StackViewPr): void {
		for (const task of rowTasks(pr)) {
			// Memoization: any existing entry (pending/ready/failed) means the work
			// is in flight or done, so skip it.
			if (store.get(task.key) !== undefined) continue;
			store.set(task.key, { state: "pending" });
			pendingKeys.add(task.key);
			totalQueued += 1;
			queue.push(task);
			emitChange();
		}
	}

	function pump(): void {
		while (activeWorkers < maxConcurrent && queue.length > 0) {
			activeWorkers += 1;
			void runWorker();
		}
	}

	async function runWorker(): Promise<void> {
		for (;;) {
			const task = queue.shift();
			if (task === undefined) break;
			// Defense in depth: processTask is written not to throw, but a rejecting
			// exec/model seam must never strand this worker slot or leave the entry
			// `pending` forever. Settle to `failed` and keep draining. Skip settling
			// when aborted so we do not resurrect an entry abort() already evicted.
			try {
				await processTask(task);
			} catch {
				if (!controller.signal.aborted) settle(task.key, { state: "failed" });
			}
		}
		activeWorkers -= 1;
		notifyIdle();
	}

	function notifyIdle(): void {
		if (queue.length !== 0 || activeWorkers !== 0) return;
		const waiters = idleWaiters.splice(0);
		for (const resolve of waiters) resolve();
	}

	function settle(key: string, entry: SettledEntry): void {
		pendingKeys.delete(key);
		store.set(key, entry);
		doneCount += 1;
		emitChange();
	}

	async function processTask(task: EnrichmentTask): Promise<void> {
		// A task never throws out of the worker loop.
		if (controller.signal.aborted) return;
		const entry = task.kind === "thread" ? await runThreadTask(task) : await runCheckTask(task);
		// If we were aborted while in flight, abort() already deleted the pending
		// entry so a later engine can retry it; do not settle it here.
		if (controller.signal.aborted) return;
		settle(task.key, entry);
	}

	function taskSignal(timeoutMs: number): AbortSignal {
		return AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
	}

	async function runThreadTask(task: {
		prNumber: number;
		thread: StackViewThreadDetail;
	}): Promise<SettledEntry> {
		if (registry === undefined) {
			degraded = MODEL_REGISTRY_UNAVAILABLE_REASON;
			return { state: "failed" };
		}
		const prompt = buildThreadSummaryPrompt({ prNumber: task.prNumber, thread: task.thread });
		const result = await callModelText({
			registry,
			provider: DEFAULT_FAST_MODEL.provider,
			modelId: DEFAULT_FAST_MODEL.modelId,
			systemPrompt: prompt.systemPrompt,
			userText: prompt.userText,
			reasoning: "minimal",
			maxTokens: THREAD_MAX_TOKENS,
			timeoutMs: THREAD_TASK_TIMEOUT_MS,
			signal: taskSignal(THREAD_TASK_TIMEOUT_MS),
		});
		if (!result.ok) return { state: "failed" };
		return { state: "ready", summary: result.text.trim() };
	}

	async function runCheckTask(task: { entry: StackViewCheckEntry }): Promise<SettledEntry> {
		if (registry === undefined) {
			// No summarizer: fetching logs would be pointless, so skip it entirely.
			degraded = MODEL_REGISTRY_UNAVAILABLE_REASON;
			return { state: "failed" };
		}
		if (checkLogUnavailableReason(task.entry) !== null) return { state: "failed" };
		// One composed signal for the whole task: a single 60s budget shared by the
		// log fetch and the model call, rather than a fresh timer per operation.
		const signal = taskSignal(CHECK_TASK_TIMEOUT_MS);
		const logResult = await fetchCheckLogTail({
			execApi,
			cwd,
			entry: task.entry,
			signal,
		});
		if (!logResult.ok) return { state: "failed" };
		const prompt = buildCheckSummaryPrompt({ entry: task.entry, logTail: logResult.logTail });
		const result = await callModelText({
			registry,
			provider: DEFAULT_FAST_MODEL.provider,
			modelId: DEFAULT_FAST_MODEL.modelId,
			systemPrompt: prompt.systemPrompt,
			userText: prompt.userText,
			reasoning: "minimal",
			maxTokens: CHECK_MAX_TOKENS,
			timeoutMs: CHECK_TASK_TIMEOUT_MS,
			signal,
		});
		if (!result.ok) return { state: "failed" };
		return { state: "ready", summary: result.text.trim() };
	}

	function drainToIdle(): Promise<void> {
		pump();
		if (queue.length === 0 && activeWorkers === 0) return Promise.resolve();
		return new Promise<void>((resolve) => {
			idleWaiters.push(resolve);
		});
	}

	return {
		snapshot() {
			return store.snapshot();
		},
		ensureRow(pr) {
			// Single-use after abort(): eviction already ran, so any newly queued
			// entry would be marked pending, skipped by workers, and stranded forever.
			if (controller.signal.aborted) return;
			enqueueRowTasks(pr);
			pump();
		},
		async ensureAll(model) {
			if (controller.signal.aborted) return;
			for (const pr of model.prs) enqueueRowTasks(pr);
			await drainToIdle();
		},
		progress() {
			if (totalQueued === 0) return null;
			return { done: doneCount, total: totalQueued };
		},
		degradedReason() {
			return degraded;
		},
		onChange(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		abort() {
			controller.abort();
			// Drop queued-but-unstarted work and evict this engine's still-pending
			// entries so a later engine retries them; ready/failed results persist.
			queue.length = 0;
			const evicted = [...pendingKeys];
			pendingKeys.clear();
			// Count the evicted still-pending tasks as done so progress() reaches
			// done === total instead of reporting incomplete forever. Workers never
			// settle these (they short-circuit on the aborted signal), and every queued
			// key is either already settled (done) or evicted here, so doneCount now
			// equals totalQueued. doneCount only rises, so progress() stays monotonic.
			doneCount += evicted.length;
			for (const key of evicted) {
				store.delete(key);
				emitChange();
			}
			notifyIdle();
		},
	};
}
