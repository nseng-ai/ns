/**
 * In-memory fakes for context-profiler tests. Constructor-state style: the
 * fake models a segmentation backend that already has an answer (or a
 * deferred gate), rather than scripting ordered calls.
 */

import type {
	SegmentationCallResult,
	SegmentationGateway,
	SegmentationRequest,
} from "../src/context-profiler/segmentation-gateway.ts";

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
