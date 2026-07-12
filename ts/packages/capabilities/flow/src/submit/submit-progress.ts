import type { NsProgressPhaseEvent, NsProgressPhaseListener } from "@nseng-ai/sdk";

import type {
	SubmitMatrixProgressController,
	SubmitMatrixProgressSink,
} from "./submit-matrix-progress.ts";

export interface SubmitProgress {
	phase(event: NsProgressPhaseEvent): void;
	matrix: SubmitMatrixProgressSink | undefined;
}

export function bindMatrixSubmitProgress(input: {
	matrix: SubmitMatrixProgressController;
}): SubmitProgress {
	return {
		phase: (event) => {
			input.matrix.phase(event);
			// Surface the full metadata progress message as the matrix tail line so
			// compact branch-cell labels are never the only source of detail.
			if (event.type === "phase-progress" && event.phaseKey === "metadata") {
				input.matrix.note(event.label);
			}
		},
		matrix: input.matrix,
	};
}

export function createStreamSubmitProgress(emit: NsProgressPhaseListener): SubmitProgress {
	return { phase: emit, matrix: undefined };
}
