import type { Caps } from "@nseng-ai/clinkr";
import { createStreamSink, type StreamSinkDeps } from "@nseng-ai/clinkr/stream";

import type { MatrixProgressAdapter } from "./matrix-progress-controller.ts";
import type { MatrixProgressSnapshot, MatrixRowSpec } from "./matrix-progress-state.ts";
import { createPhaseStreamRenderer } from "./phase-stream-renderer.ts";

export interface CreateMatrixSettledAdapterOptions {
	caps: Caps;
	deps: StreamSinkDeps;
}

/** Plain settled phase transcript backed only by the controller's canonical phase views. */
export function createMatrixSettledAdapter<ColumnKey extends string, Row extends MatrixRowSpec>(
	options: CreateMatrixSettledAdapterOptions,
): MatrixProgressAdapter<ColumnKey, Row> {
	const sink = createStreamSink(options.caps, options.deps);
	let latest: MatrixProgressSnapshot<ColumnKey, Row> | undefined;
	const renderer = createPhaseStreamRenderer({
		caps: options.caps,
		sink,
		views: () => latest?.phases ?? [],
		tailLine: () => undefined,
	});

	function update(snapshot: MatrixProgressSnapshot<ColumnKey, Row>): void {
		latest = snapshot;
		renderer.setTitle(snapshot.title);
	}

	function phaseLabel(
		snapshot: MatrixProgressSnapshot<ColumnKey, Row>,
		phaseKey: string,
	): string | undefined {
		for (const phase of snapshot.phases) {
			if (phase.key === phaseKey) return phase.label;
			const substep = phase.substeps.find((candidate) => candidate.key === phaseKey);
			if (substep !== undefined) return substep.label;
		}
		return undefined;
	}

	return {
		begin: ({ snapshot }) => {
			update(snapshot);
			sink.start();
			renderer.render();
		},
		observe: (change, getSnapshot) => {
			if (change.kind === "title-changed") {
				update(getSnapshot());
				renderer.render();
				return;
			}
			if (change.kind !== "phase-event") return;

			const snapshot = getSnapshot();
			update(snapshot);
			switch (change.event.type) {
				case "phase-started":
					renderer.surface(phaseLabel(snapshot, change.event.phaseKey));
					return;
				case "phase-progress":
					renderer.surface(phaseLabel(snapshot, change.event.phaseKey));
					return;
				case "phase-done":
				case "phase-failed":
					renderer.render();
					return;
				case "phases-declared":
				case "title-changed":
				case "matrix-declared":
				case "matrix-rows":
				case "matrix-cell":
				case "matrix-active-operations":
					return;
			}
		},
		beforeFinish: async () => {},
		finish: async ({ finalLines, snapshot }) => {
			update(snapshot);
			renderer.render();
			sink.finish(finalLines);
			sink.stop();
		},
		stop: async () => sink.stop(),
	};
}
