import type {
	NsExtensionApi,
	NsProgressPhaseEvent,
	NsProgressPhaseListener,
} from "@nseng-ai/sdk/sdk";

import type {
	SubmitMatrixProgressController,
	SubmitMatrixProgressSink,
} from "./submit-matrix-progress.ts";

export interface SubmitProgress {
	phase(event: NsProgressPhaseEvent): void;
	matrix: SubmitMatrixProgressSink | undefined;
}

export function bindMatrixSubmitProgress(input: {
	ctx: NsExtensionApi;
	matrix: SubmitMatrixProgressController;
}): SubmitProgress {
	return {
		phase: createMatrixAwarePhaseListener(input.ctx, (event) => {
			// Surface the full metadata progress message as the matrix tail line so
			// compact branch-cell labels are never the only source of detail.
			if (event.type === "phase-progress" && event.phaseKey === "metadata") {
				input.matrix.note(event.label);
			}
		}),
		matrix: input.matrix,
	};
}

export function createStreamSubmitProgress(emit: NsProgressPhaseListener): SubmitProgress {
	return { phase: emit, matrix: undefined };
}

export function createForwardOnlyPhaseListener(ctx: NsExtensionApi): NsProgressPhaseListener {
	return (event) => {
		if (ctx.progress.isLive) ctx.progress.phase(event);
	};
}

export function createMatrixAwarePhaseListener(
	ctx: NsExtensionApi,
	onEvent: NsProgressPhaseListener,
): NsProgressPhaseListener {
	const forward = createForwardOnlyPhaseListener(ctx);
	return (event) => {
		forward(event);
		onEvent(event);
	};
}
