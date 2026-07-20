import type { Caps } from "@nseng-ai/clinkr";
import { SPINNER_FRAME_MS, type FrameRenderer, type StreamSink } from "@nseng-ai/clinkr/stream";
import { bold, dim, ellipsisFor, statusLine, truncatePlain } from "@nseng-ai/foundation/cli-theme";

import {
	createProgressPhaseStateStore,
	type ProgressPhaseView,
} from "../sdk/progress-phase-state.ts";
import { isMatrixProgressEvent, type NsProgressPhaseEvent } from "../sdk/services.ts";
import type { CommandEventSink } from "./ns-clinkr-command.ts";

export interface CommandProgressPhaseRenderer {
	emit(event: NsProgressPhaseEvent): void;
	finish(options?: { readonly isFailed?: boolean }): Promise<void>;
	stop(): Promise<void>;
}

export interface CreateCommandProgressPhaseRendererOptions {
	readonly caps: Caps;
	readonly sink: StreamSink;
	readonly forward?: CommandEventSink;
}

/**
 * Renders the SDK phase-event vocabulary at a CLI host edge. Matrix events are deliberately ignored:
 * matrix layout and transcript policy remain capability-owned presentation concerns.
 */
export function createCommandProgressPhaseRenderer(
	options: CreateCommandProgressPhaseRendererOptions,
): CommandProgressPhaseRenderer {
	const store = createProgressPhaseStateStore();
	const rendersTerminal = options.forward?.isLive !== true;
	let hasDeclaration = false;
	let isRunning = false;
	let pumpPromise: Promise<void> | undefined;
	let isStopped = false;

	const frame: FrameRenderer = (tick) => [
		bold(store.title() ?? ""),
		...store.views().flatMap((view) => renderView(view, tick, 0, options.caps)),
	];

	function begin(): void {
		if (hasDeclaration) return;
		hasDeclaration = true;
		if (!rendersTerminal) return;
		options.sink.start();
		options.sink.render(frame);
		if (!options.caps.isTty) return;
		isRunning = true;
		pumpPromise = pump();
	}

	async function pump(): Promise<void> {
		while (isRunning) await options.sink.hold({ tickMs: SPINNER_FRAME_MS });
	}

	function emit(event: NsProgressPhaseEvent): void {
		if (options.forward?.isLive === true) options.forward.emit(event);
		const affectedView = store.apply(event);
		if (event.type === "phases-declared") begin();
		if (!rendersTerminal || !hasDeclaration || isMatrixProgressEvent(event)) return;
		if (event.type === "title-changed") {
			options.sink.render(frame);
			return;
		}
		if (affectedView === undefined) return;
		if (event.type === "phase-started" || event.type === "phase-progress") {
			if (options.caps.isTty) options.sink.render(frame);
			else {
				void options.sink.hold({
					tickMs: SPINNER_FRAME_MS,
					...(affectedView.label === undefined ? {} : { transient: affectedView.label }),
				});
			}
			return;
		}
		options.sink.render(frame);
	}

	async function drainPump(): Promise<void> {
		isRunning = false;
		if (pumpPromise !== undefined) await pumpPromise;
	}

	async function finish(finishOptions: { readonly isFailed?: boolean } = {}): Promise<void> {
		if (!hasDeclaration) return;
		const settlementEvents =
			finishOptions.isFailed === true ? store.failActive() : store.settleOpenPhases();
		if (!rendersTerminal) {
			for (const event of settlementEvents) options.forward?.emit(event);
			return;
		}
		try {
			await drainPump();
			options.sink.render(frame);
			options.sink.finish([]);
		} finally {
			await stop();
		}
	}

	async function stop(): Promise<void> {
		if (isStopped || !rendersTerminal) return;
		isStopped = true;
		await drainPump();
		options.sink.stop();
	}

	return { emit, finish, stop };
}

function renderView(view: ProgressPhaseView, tick: number, indent: number, caps: Caps): string[] {
	const item = {
		name: view.name,
		detail: view.detail ?? view.name,
		...(view.label === undefined ? {} : { label: view.label }),
	};
	const prefix = " ".repeat(indent);
	const rowCaps = { ...caps, columns: Math.max(0, caps.columns - indent) };
	return [
		`${prefix}${statusLine({ caps: rowCaps, item, state: view.state, tick })}`,
		...view.substeps.flatMap((substep) => renderView(substep, tick, indent + 4, caps)),
		...view.history.map(
			(entry) =>
				`${" ".repeat(indent + 6)}${dim(
					truncatePlain(entry, Math.max(0, caps.columns - indent - 6), ellipsisFor(caps)),
				)}`,
		),
	];
}
