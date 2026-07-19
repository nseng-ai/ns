/**
 * The stack-view enrichment engine: the I/O half of the enrichment subsystem. It
 * turns a stack model into background summarization tasks — one per unresolved
 * review thread, one per failing check — drains them through a bounded worker
 * pool, and records each result in the injected {@link EnrichmentStore}. All pure
 * key/store/prompt logic lives in the sibling `enrichment-*` modules; this module
 * owns only the concurrency, cancellation, and external-call plumbing.
 *
 * Memoization: a `pending`/`ready` key is never re-queued, so re-`ensureRow`/
 * `ensureAll` calls are cheap and idempotent. A `failed` key is retried at most
 * once per engine (transient failures should not be negative-cached for the whole
 * session), but never while the engine is degraded.
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
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import { callPiModelText } from "@nseng-ai/pi/models/call";
import type { PiModelCallFailureReason, PiModelRegistryLike } from "@nseng-ai/pi/models/call";

import { createChangeEmitter } from "./change-emitter.ts";
import { fetchCheckLogTail } from "./check-logs.ts";
import { checkEnrichmentKey, threadEnrichmentKey } from "./enrichment-keys.ts";
import {
	CHECK_LOG_TAIL_MAX_CHARS,
	buildCheckSummaryPrompt,
	buildThreadSummaryPrompt,
	type ModelPromptText,
} from "./enrichment-prompts.ts";
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

/** A settled enrichment result the engine records (never `pending`). */
type SettledEntry = Extract<EnrichmentEntry, { state: "ready" } | { state: "failed" }>;

const SYSTEMIC_FAILURE_MESSAGES = {
	"model-unavailable": "Enrichment model is unavailable",
	auth: "Enrichment model authentication failed",
	"empty-auth": "Enrichment model authentication is not configured",
} as const satisfies Partial<Record<PiModelCallFailureReason, string>>;

type SystemicFailureReason = keyof typeof SYSTEMIC_FAILURE_MESSAGES;

function isSystemicFailure(reason: PiModelCallFailureReason): reason is SystemicFailureReason {
	return reason in SYSTEMIC_FAILURE_MESSAGES;
}

/** Concise, human-readable degraded reason for a systemic model failure. */
function describeSystemicFailure(reason: SystemicFailureReason, message: string | null): string {
	const base = SYSTEMIC_FAILURE_MESSAGES[reason];
	return message === null ? `${base}.` : `${base}: ${message}`;
}

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
	 * Done is derived as `total - pending`, so evicting this engine's still-pending
	 * entries on abort() drives progress to `done === total`.
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
	registry: PiModelRegistryLike;
	modelSelection: ModelSelection;
	/** Test seam; defaults to the real {@link callPiModelText}. */
	callModelText?: typeof callPiModelText;
	maxConcurrent?: number;
}

export function createStackEnrichmentEngine(
	options: CreateStackEnrichmentEngineOptions,
): StackEnrichmentPort {
	const { store, execApi, cwd, registry, modelSelection } = options;
	const callModelText = options.callModelText ?? callPiModelText;
	const maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT);

	const controller = new AbortController();
	const changeEmitter = createChangeEmitter();
	const queue: EnrichmentTask[] = [];
	// Keys this engine set to `pending` and has not yet settled; the eviction set
	// for abort() so we only drop pending entries this engine owns.
	const pendingKeys = new Set<string>();
	// `failed` keys this engine has already re-queued once, so each transient
	// failure gets exactly one retry per engine and is not retried indefinitely.
	const retriedKeys = new Set<string>();
	const idleWaiters: Array<() => void> = [];

	let activeWorkers = 0;
	let totalQueued = 0;
	let degraded: string | null = null;

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
			const existing = store.get(task.key);
			if (existing !== undefined) {
				if (!canRetry(task.key, existing)) continue;
				retriedKeys.add(task.key);
			}
			store.set(task.key, { state: "pending" });
			pendingKeys.add(task.key);
			totalQueued += 1;
			queue.push(task);
			changeEmitter.emitChange();
		}
	}

	// A `pending`/`ready` entry is in flight or done, so skip it. A `failed` entry
	// is retried once per engine (a transient failure must not be negative-cached
	// for the whole session), but never while degraded: a systemic failure means
	// the model path is dead, so re-queueing would only hammer it.
	function canRetry(key: string, existing: EnrichmentEntry): boolean {
		return existing.state === "failed" && degraded === null && !retriedKeys.has(key);
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
		changeEmitter.emitChange();
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
		const prompt = buildThreadSummaryPrompt({ prNumber: task.prNumber, thread: task.thread });
		return summarizeWithModel({
			prompt,
			maxTokens: THREAD_MAX_TOKENS,
			signal: taskSignal(THREAD_TASK_TIMEOUT_MS),
		});
	}

	async function runCheckTask(task: { entry: StackViewCheckEntry }): Promise<SettledEntry> {
		// One composed signal for the whole task: a single 60s budget shared by the
		// log fetch and the model call, rather than a fresh timer per operation.
		const signal = taskSignal(CHECK_TASK_TIMEOUT_MS);
		const logResult = await fetchCheckLogTail({
			execApi,
			cwd,
			entry: task.entry,
			signal,
			maxChars: CHECK_LOG_TAIL_MAX_CHARS,
		});
		if (!logResult.ok) return { state: "failed" };
		const prompt = buildCheckSummaryPrompt({ entry: task.entry, logTail: logResult.logTail });
		return summarizeWithModel({
			prompt,
			maxTokens: CHECK_MAX_TOKENS,
			signal,
		});
	}

	async function summarizeWithModel(options: {
		prompt: ModelPromptText;
		maxTokens: number;
		signal: AbortSignal;
	}): Promise<SettledEntry> {
		const result = await callModelText({
			registry,
			modelSelection,
			systemPrompt: options.prompt.systemPrompt,
			userText: options.prompt.userText,
			maxTokens: options.maxTokens,
			// The composed task signal is the single deadline authority; do not start
			// a second, fresh timeout window at the model call.
			signal: options.signal,
		});
		if (!result.ok) {
			// Systemic failures (the model path is unusable for the whole session)
			// flip the engine to a sticky degraded state — first reason wins — so the
			// overlay surfaces one notice instead of silently failing every entry.
			// Transient failures (aborted/request-failed) stay per-entry `failed` and
			// remain retryable.
			if (isSystemicFailure(result.reason) && degraded === null) {
				degraded = describeSystemicFailure(result.reason, result.message);
			}
			return { state: "failed" };
		}
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
			return { done: totalQueued - pendingKeys.size, total: totalQueued };
		},
		degradedReason() {
			return degraded;
		},
		onChange: changeEmitter.onChange,
		abort() {
			controller.abort();
			// Drop queued-but-unstarted work and evict this engine's still-pending
			// entries so a later engine retries them; ready/failed results persist.
			queue.length = 0;
			const evicted = [...pendingKeys];
			// Clearing pendingKeys drives progress() to done === total: every queued
			// key is now either already settled or evicted here. Workers never settle
			// evicted keys (they short-circuit on the aborted signal).
			pendingKeys.clear();
			for (const key of evicted) {
				store.delete(key);
				changeEmitter.emitChange();
			}
			notifyIdle();
		},
	};
}
