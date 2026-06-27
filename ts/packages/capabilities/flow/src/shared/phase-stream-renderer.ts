import type { Caps } from "@sdl/clinkr";
import { SPINNER_FRAME_MS, type FrameRenderer, type StreamSink } from "@sdl/clinkr/stream";
import { bold, dim, ellipsisFor, statusLine, truncatePlain } from "@sdl/clinkr/theme";

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
			...options.views().map((view) => {
				const item = view.label === undefined ? view.item : { ...view.item, label: view.label };
				return statusLine({ caps: options.caps, item: item, state: view.state, tick: tick });
			}),
		];
		const tail = options.tailLine();
		if (tail !== undefined) {
			lines.push(
				`       ${dim(truncatePlain(tail, Math.max(0, options.caps.columns - 7), ellipsisFor(options.caps)))}`,
			);
		}
		return lines;
	};

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
