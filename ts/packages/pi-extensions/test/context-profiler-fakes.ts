/**
 * In-memory fakes and shared data builders for context-profiler tests.
 * Fakes are constructor-state style: the fake models an analysis backend that
 * already has answers (or a deferred gate), rather than scripting ordered calls.
 */

import type { BundleSnapshot } from "../src/context-profiler/bundle.ts";
import type { BundleStore, PersistBundleResult, WriteEpisodesFileResult } from "../src/context-profiler/bundle-store.ts";
import type { InterrogationSession, InterrogationSessionFactory, InterrogationEvent, AskResult, CreateInterrogationSessionResult } from "../src/context-profiler/interrogation-session.ts";
import type { LiveTurn, ProfileSnapshot } from "../src/context-profiler/model.ts";
import { normalizeMessage } from "../src/context-profiler/model.ts";
import type {
	AnalysisModelGateway,
	EpisodeAnalysisCallResult,
	EpisodeAnalysisRequest,
	SegmentationCallResult,
	SegmentationRequest,
} from "../src/context-profiler/analysis-model-gateway.ts";

export function makeTurn(index: number, overrides: Partial<LiveTurn> = {}): LiveTurn {
	return {
		index,
		role: "user",
		tokens: { value: 4, provenance: "estimated" },
		toolNames: [],
		excerpt: `turn ${index}`,
		message: normalizeMessage({ role: "user", content: `turn ${index}` }),
		...overrides,
	};
}

/** Turns at exactly these indices — gaps model an elided (capped-out) middle. */
export function makeTurns(indices: readonly number[]): LiveTurn[] {
	return indices.map((index) => makeTurn(index));
}

export function sequentialTurns(count: number): LiveTurn[] {
	return makeTurns(Array.from({ length: count }, (_unused, position) => position + 1));
}

export function makeProfile(turns: readonly LiveTurn[], overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
	const originalCount = overrides.cap?.originalCount ?? turns.length;
	return {
		cwd: "/repo",
		model: "anthropic/claude-fable-5",
		usage: undefined,
		baseRegions: [],
		liveTurns: [...turns],
		liveRegions: [],
		liveSource: "context-event",
		cap: { originalCount, includedCount: turns.length, elidedMiddleTurns: originalCount - turns.length },
		openedAt: "12:00:00",
		...overrides,
	};
}

export interface FakeSegmentationGatewayOptions {
	result: SegmentationCallResult;
	analysisResult?: EpisodeAnalysisCallResult;
	/** When set, segmentTurns and analyzeEpisode resolve only after this promise settles. */
	gate?: Promise<void>;
}

export class FakeBundleStore implements BundleStore {
	private readonly persistResult: PersistBundleResult;
	private readonly writeResult: WriteEpisodesFileResult;
	private readonly persistLog: BundleSnapshot[] = [];
	private readonly episodesLog: Array<{ bundleDir: string; json: string }> = [];

	constructor(options: { persistResult: PersistBundleResult; writeResult?: WriteEpisodesFileResult }) {
		this.persistResult = options.persistResult;
		this.writeResult = options.writeResult ?? { ok: true, alreadyPresent: false };
	}

	get persistedSnapshots(): readonly BundleSnapshot[] {
		return [...this.persistLog];
	}

	get episodesWrites(): ReadonlyArray<{ bundleDir: string; json: string }> {
		return this.episodesLog.map((entry) => ({ ...entry }));
	}

	async persistBundle(snapshot: BundleSnapshot): Promise<PersistBundleResult> {
		this.persistLog.push(snapshot);
		return this.persistResult;
	}

	async writeEpisodesFile(options: { bundleDir: string; json: string }): Promise<WriteEpisodesFileResult> {
		this.episodesLog.push({ ...options });
		return this.writeResult;
	}
}

export class FakeInterrogationSession implements InterrogationSession {
	private readonly events: InterrogationEvent[];
	private readonly askResult: AskResult;
	private listeners: Array<(event: InterrogationEvent) => void> = [];
	private disposed = false;
	private streaming = false;
	private readonly asks: string[] = [];
	private aborts = 0;

	constructor(options: { events?: readonly InterrogationEvent[]; askResult?: AskResult } = {}) {
		this.events = [...(options.events ?? [])];
		this.askResult = options.askResult ?? { ok: true };
	}

	get askLog(): readonly string[] {
		return [...this.asks];
	}

	get abortCount(): number {
		return this.aborts;
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	subscribe(listener: (event: InterrogationEvent) => void): () => void {
		this.listeners = [...this.listeners, listener];
		return () => {
			this.listeners = this.listeners.filter((candidate) => candidate !== listener);
		};
	}

	async ask(text: string): Promise<AskResult> {
		this.asks.push(text);
		this.streaming = true;
		for (const event of this.events) {
			for (const listener of this.listeners) listener(event);
		}
		this.streaming = false;
		return this.askResult;
	}

	async abortTurn(): Promise<void> {
		this.aborts += 1;
		this.streaming = false;
	}

	isStreaming(): boolean {
		return this.streaming;
	}

	dispose(): void {
		this.disposed = true;
	}
}

export class FakeInterrogationSessionFactory implements InterrogationSessionFactory {
	private readonly result: CreateInterrogationSessionResult;
	private readonly calls: Array<{ bundleDir: string; systemPrompt: string }> = [];

	constructor(result: CreateInterrogationSessionResult = { ok: true, value: new FakeInterrogationSession() }) {
		this.result = result;
	}

	get createCalls(): ReadonlyArray<{ bundleDir: string; systemPrompt: string }> {
		return this.calls.map((call) => ({ ...call }));
	}

	async create(options: Parameters<InterrogationSessionFactory["create"]>[0]): Promise<CreateInterrogationSessionResult> {
		this.calls.push({ bundleDir: options.bundleDir, systemPrompt: options.systemPrompt });
		return this.result;
	}
}

export class FakeSegmentationGateway implements AnalysisModelGateway {
	private readonly result: SegmentationCallResult;
	private readonly analysisResult: EpisodeAnalysisCallResult;
	private readonly gate: Promise<void> | null;
	private readonly segmentationLog: SegmentationRequest[] = [];
	private readonly analysisLog: EpisodeAnalysisRequest[] = [];

	constructor(options: FakeSegmentationGatewayOptions) {
		this.result = options.result;
		this.analysisResult = options.analysisResult ?? { ok: true, value: { efficiency: "efficient", relevance: "load-bearing", summary: null } };
		this.gate = options.gate ?? null;
	}

	/** Read-only segmentation call log; calls have no other observable state to inspect. */
	get calls(): readonly SegmentationRequest[] {
		return [...this.segmentationLog];
	}

	/** Read-only episode-analysis call log; calls have no other observable state to inspect. */
	get analysisCalls(): readonly EpisodeAnalysisRequest[] {
		return [...this.analysisLog];
	}

	async segmentTurns(request: SegmentationRequest, options: { signal: AbortSignal }): Promise<SegmentationCallResult> {
		this.segmentationLog.push(request);
		if (this.gate !== null) await this.gate;
		if (options.signal.aborted) {
			return { ok: false, error: { code: "aborted", message: "segmentation request aborted" } };
		}
		return this.result;
	}

	async analyzeEpisode(request: EpisodeAnalysisRequest, options: { signal: AbortSignal }): Promise<EpisodeAnalysisCallResult> {
		this.analysisLog.push(request);
		if (this.gate !== null) await this.gate;
		if (options.signal.aborted) {
			return { ok: false, error: { code: "aborted", message: "episode analysis request aborted" } };
		}
		return this.analysisResult;
	}
}
