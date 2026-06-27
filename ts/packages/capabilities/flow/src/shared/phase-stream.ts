// The flow-side presentation driver for live, multi-phase progress (`flow submit` / `flow cp`).
//
// It owns the ordered phase list, the per-phase state/label arrays, and the spinner pump; it RENDERS
// frames via the `@sdl/clinkr/theme` `statusLine` grammar and drives a `@sdl/clinkr/stream` sink.
// The lower layers (graphite submit, the checkpoint workflow) stay domain-pure: they emit typed
// `ProgressPhaseEvent`s keyed by a stable `phaseKey`; this driver switches on that key.
//
// This is the one new `flow → clinkr` edge. The event type lives in `@sdl/core` (graphite already
// depends on it), so clinkr stays free of any `@sdl/*` dependency and is never imported by graphite.
//
// Interim bridge: flow resolves its own `Caps` via `resolveProcessCaps()` — streaming is a side
// channel, NOT routed through clinkr's `emitExit`. A later pass retires that bridge.

import { resolveProcessCaps, type Caps } from "@sdl/clinkr";
import {
	createStdoutStreamWriter,
	createStreamSink,
	SPINNER_FRAME_MS,
	systemStreamClock,
	type FrameRenderer,
	type StreamSinkDeps,
} from "@sdl/clinkr/stream";
import {
	bold,
	dim,
	ellipsisFor,
	statusLine,
	truncatePlain,
	type PhaseState,
	type StatusLineItem,
} from "@sdl/clinkr/theme";
import type { ProgressPhaseEvent } from "@sdl/core/progress-phase";
import type { SdlExtensionApi } from "sdl-sdk";

import { createFlowLiveOutput } from "./live-output.ts";

/** One declared phase: a stable sequencing `key` plus its presentational status-line payload. */
export interface PhaseSpec {
	key: string;
	item: StatusLineItem;
}

/** The driver surface a command drives: title once, feed events, finalize. */
export interface PhaseStream {
	/** Take ownership of the live region and start the spinner pump (TTY only). */
	begin(title: string): void;
	/** The `onPhase` listener: advance the phase list and repaint / emit a transient. */
	emit(event: ProgressPhaseEvent): void;
	/**
	 * Feed a raw subprocess transcript chunk into the live region's tail line (TTY only; a no-op
	 * otherwise). Routing the transcript THROUGH the sink keeps `log-update` the sole writer, so its
	 * line accounting never desyncs — writing it straight to stdout duplicated and scrolled the region.
	 */
	note(text: string): void;
	/** Mark the currently active phase as failed (call before `finish` on a non-zero exit). */
	fail(): void;
	/** Settle the remaining phases, persist the region, and restore the cursor. */
	finish(finalLines?: readonly string[]): Promise<void>;
}

/** Ordered phase list for `flow submit`. Keys match what the submit driver and graphite emit. */
export const SUBMIT_PHASES: readonly PhaseSpec[] = [
	{
		key: "checkpoint",
		item: {
			name: "Checkpoint",
			detail: "checkpoint complete",
			label: "checkpointing pending changes…",
		},
	},
	{
		key: "preflight",
		item: { name: "Preflight", detail: "ready to submit", label: "checking submit readiness…" },
	},
	{
		key: "metadata",
		item: { name: "Metadata", detail: "metadata prepared", label: "preparing PR metadata…" },
	},
	{
		key: "submit",
		item: { name: "Submit", detail: "stack submitted", label: "running gt submit…" },
	},
	{
		key: "verification",
		item: { name: "Verification", detail: "PRs verified", label: "checking submitted PRs…" },
	},
	{
		key: "descriptions",
		item: {
			name: "Descriptions",
			detail: "descriptions ready",
			label: "generating PR descriptions…",
		},
	},
];

/** Ordered phase list for `flow cp`. Keys match what the checkpoint workflow emits. */
export const CP_PHASES: readonly PhaseSpec[] = [
	{
		key: "inspect",
		item: { name: "Inspect", detail: "worktree inspected", label: "inspecting worktree…" },
	},
	{
		key: "generate",
		item: {
			name: "Generate",
			detail: "checkpoint message ready",
			label: "generating checkpoint message…",
		},
	},
	{
		key: "commit",
		item: { name: "Commit", detail: "checkpoint committed", label: "creating checkpoint commit…" },
	},
];

/**
 * Translate a checkpoint-workflow event (keyed inspect/generate/commit) into a single presentational
 * label, so `flow submit` can fold the whole checkpoint into its one "Checkpoint" phase.
 */
export function checkpointEventLabel(event: ProgressPhaseEvent): string | undefined {
	if (event.type === "phase-progress") return event.label;
	if (event.type === "phase-started") {
		if (event.label !== undefined) return event.label;
		return CP_PHASES.find((spec) => spec.key === event.phaseKey)?.item.label;
	}
	return undefined;
}

export function createPhaseStream(
	caps: Caps,
	specs: readonly PhaseSpec[],
	deps: StreamSinkDeps,
): PhaseStream {
	const sink = createStreamSink(caps, deps);
	const states: PhaseState[] = specs.map(() => "pending");
	const labels: (string | undefined)[] = specs.map((spec) => spec.item.label);
	const indexByKey = new Map(specs.map((spec, index) => [spec.key, index] as const));
	let header = "";
	let activeIndex = -1;
	let running = false;
	let pumpPromise: Promise<void> | undefined;
	// The freshest raw-transcript line and the buffer of bytes not yet terminated by a newline / CR.
	let tail: string | undefined;
	let tailBuffer = "";

	// Every frame re-reads the mutable arrays, so spinner ticks and event mutations compose in one place.
	// The raw subprocess transcript, when present, rides as a dimmed tail line INSIDE the frame so the
	// sink's writer owns every byte (mirrors the north star; no direct stdout writes alongside it).
	const frame: FrameRenderer = (tick) => {
		const lines = [
			bold(header),
			...specs.map((spec, index) => {
				const label = labels[index];
				const item: StatusLineItem = label === undefined ? spec.item : { ...spec.item, label };
				return statusLine(caps, item, states[index] ?? "pending", tick);
			}),
		];
		if (tail !== undefined) {
			lines.push(
				`       ${dim(truncatePlain(tail, Math.max(0, caps.columns - 7), ellipsisFor(caps)))}`,
			);
		}
		return lines;
	};

	function clearTail(): void {
		tail = undefined;
		tailBuffer = "";
	}

	function repaint(): void {
		if (caps.isTty) sink.render(frame);
	}

	// The real waits happen inside the lower-layer awaits, so spinner motion can't be caller-driven
	// between phases: pump concurrently and let its clock.sleep timers interleave with the real I/O.
	async function pump(): Promise<void> {
		while (running) {
			await sink.hold({ tickMs: SPINNER_FRAME_MS });
		}
	}

	function markEarlierDone(index: number): void {
		for (let i = 0; i < index; i += 1) {
			const state = states[i];
			if (state === "pending" || state === "active") states[i] = "done";
		}
	}

	function setActive(index: number): void {
		markEarlierDone(index);
		states[index] = "active";
		activeIndex = index;
	}

	// TTY: repaint immediately so the event shows at once. Non-tty: route the transient to onOutput
	// (the spinner pump never runs there — its `hold` would busy-loop without sleeping).
	function surface(line: string | undefined): void {
		if (caps.isTty) {
			sink.render(frame);
			return;
		}
		if (line !== undefined) void sink.hold({ tickMs: SPINNER_FRAME_MS, transient: line });
	}

	// TTY only: accumulate transcript bytes, take the freshest non-empty line (CR-aware, so Graphite's
	// in-place spinner progress shows), and repaint. Non-tty routes its transcript straight to ctx.
	function note(text: string): void {
		if (!caps.isTty) return;
		tailBuffer += text;
		const segments = tailBuffer.split(/\r\n|\r|\n/);
		tailBuffer = segments.pop() ?? "";
		const latest = [tailBuffer, ...segments.reverse()].find((segment) => segment.trim() !== "");
		if (latest !== undefined) tail = latest.trim();
		sink.render(frame);
	}

	function begin(title: string): void {
		header = title;
		sink.start();
		sink.render(frame);
		if (caps.isTty) {
			running = true;
			pumpPromise = pump();
		}
	}

	function emit(event: ProgressPhaseEvent): void {
		const index = indexByKey.get(event.phaseKey);
		if (index === undefined) return;
		const spec = specs[index];
		if (spec === undefined) return;
		switch (event.type) {
			case "phase-started":
				setActive(index);
				labels[index] = event.label ?? spec.item.label;
				surface(labels[index]);
				break;
			case "phase-progress":
				if (states[index] === "pending") setActive(index);
				labels[index] = event.label;
				surface(event.label);
				break;
			case "phase-done":
				states[index] = "done";
				clearTail();
				repaint();
				break;
			case "phase-failed":
				states[index] = "failed";
				labels[index] = event.detail;
				clearTail();
				repaint();
				break;
		}
	}

	function fail(): void {
		if (activeIndex >= 0) states[activeIndex] = "failed";
		repaint();
	}

	async function finish(finalLines: readonly string[] = []): Promise<void> {
		running = false;
		if (pumpPromise !== undefined) await pumpPromise;
		// On overall success, settle every still-open phase; a failure leaves its red row standing.
		const hasFailure = states.some((state) => state === "failed");
		if (!hasFailure) {
			for (let i = 0; i < states.length; i += 1) {
				const state = states[i];
				if (state === "pending" || state === "active") states[i] = "done";
			}
		}
		// The persisted region must not carry a transient transcript line; the settled phases stand alone.
		clearTail();
		repaint();
		sink.finish(finalLines);
		sink.stop();
	}

	return { begin, emit, note, fail, finish };
}

/** The interim caps bridge: resolve straight from the process (not via clinkr's `emitExit`). */
export function resolveFlowStreamCaps(): Caps {
	return resolveProcessCaps();
}

/**
 * Wire the sink's seams to the command context.
 *  - TTY: real in-place animation against stdout (tests inject a fake writer/clock instead).
 *  - non-TTY: route everything through `ctx` so `run.liveOutput` captures it and Pi gets honest
 *    output, with nothing leaking to `process.*`. The settled frame and the per-phase transients
 *    both flow through the same live channel (zero cursor escapes).
 */
export function flowStreamDeps(ctx: SdlExtensionApi, caps: Caps): StreamSinkDeps {
	if (caps.isTty) {
		return { writer: createStdoutStreamWriter(), clock: systemStreamClock };
	}
	const live = createFlowLiveOutput(ctx);
	return {
		writer: {
			write: (text) => live?.("stderr", text),
			redraw() {},
			done() {},
		},
		onOutput: (line) => live?.("stderr", `${line}\n`),
	};
}
