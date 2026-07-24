import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

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
		phase: (event) => input.matrix.phase(event),
		matrix: input.matrix,
	};
}
