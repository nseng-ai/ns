import type { Caps } from "@nseng-ai/clinkr";
import { SPINNER_FRAME_MS, type FrameRenderer, type StreamSink } from "@nseng-ai/clinkr/stream";
import { bold, dim, ellipsisFor, statusLine, truncatePlain } from "@nseng-ai/foundation/cli-theme";

import type { PhaseView } from "./phase-stream-state.ts";

export interface PhaseStreamRenderer {
	setTitle(title: string): void;
	render(): void;
	surface(line: string | undefined): void;
}

export interface PhaseStreamRendererOptions {
	caps: Caps;
	sink: StreamSink;
	views: () => readonly PhaseView[];
	tailLine: () => string | undefined;
}

export function createPhaseStreamRenderer(
	options: PhaseStreamRendererOptions,
): PhaseStreamRenderer {
	let header = "";

	const frame: FrameRenderer = (tick) => {
		const lines = [
			bold(header),
			...options
				.views()
				.flatMap((view) => [
					renderStatusLine(view, tick, 0),
					...view.substeps.flatMap((substep) => [
						renderStatusLine(substep, tick, 4),
						...renderHistory(substep.history, 10),
					]),
					...renderHistory(view.history, 6),
				]),
		];
		const tail = options.tailLine();
		if (tail !== undefined) {
			lines.push(
				`       ${dim(truncatePlain(tail, Math.max(0, options.caps.columns - 7), ellipsisFor(options.caps)))}`,
			);
		}
		return lines;
	};

	function renderStatusLine(view: PhaseView, tick: number, indent: number): string {
		const item = view.label === undefined ? view.item : { ...view.item, label: view.label };
		const prefix = " ".repeat(indent);
		const caps = { ...options.caps, columns: Math.max(0, options.caps.columns - indent) };
		return `${prefix}${statusLine({ caps, item, state: view.state, tick })}`;
	}

	function renderHistory(history: readonly string[], indent: number): string[] {
		const prefix = " ".repeat(indent);
		return history.map(
			(entry) =>
				`${prefix}${dim(truncatePlain(entry, Math.max(0, options.caps.columns - indent), ellipsisFor(options.caps)))}`,
		);
	}

	function setTitle(title: string): void {
		header = title;
	}

	function render(): void {
		options.sink.render(frame);
	}

	function surface(line: string | undefined): void {
		if (options.caps.isTty) {
			options.sink.render(frame);
			return;
		}
		if (line !== undefined) void options.sink.hold({ tickMs: SPINNER_FRAME_MS, transient: line });
	}

	return { setTitle, render, surface };
}
