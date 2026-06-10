/**
 * In-memory fakes and shared data builders for context-profiler tests.
 * Fakes are constructor-state style: the fake models a segmentation backend
 * that already has an answer (or a deferred gate), rather than scripting
 * ordered calls.
 */

import type { LiveTurn, ProfileSnapshot } from "../src/context-profiler/model.ts";
import { normalizeMessage } from "../src/context-profiler/model.ts";
import type {
	SegmentationCallResult,
	SegmentationGateway,
	SegmentationRequest,
} from "../src/context-profiler/segmentation-gateway.ts";

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
	/** When set, segmentTurns resolves only after this promise settles. */
	gate?: Promise<void>;
}

export class FakeSegmentationGateway implements SegmentationGateway {
	private readonly result: SegmentationCallResult;
	private readonly gate: Promise<void> | null;
	private readonly log: SegmentationRequest[] = [];

	constructor(options: FakeSegmentationGatewayOptions) {
		this.result = options.result;
		this.gate = options.gate ?? null;
	}

	/** Read-only call log; calls have no other observable state to inspect. */
	get calls(): readonly SegmentationRequest[] {
		return [...this.log];
	}

	async segmentTurns(request: SegmentationRequest, options: { signal: AbortSignal }): Promise<SegmentationCallResult> {
		this.log.push(request);
		if (this.gate !== null) await this.gate;
		if (options.signal.aborted) {
			return { ok: false, error: { code: "aborted", message: "segmentation request aborted" } };
		}
		return this.result;
	}
}
