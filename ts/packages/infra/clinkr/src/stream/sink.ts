// The in-place pretty sink for clinkr's streaming surface. Generalized from the throwaway harness's
// `renderInPlace`: it RENDERS frames it is handed and animates them, but it does NOT own phase
// sequencing — a caller-owned streaming row drives the loop and decides what each frame contains.
//
// Two behaviors keyed on `caps.isTty`:
//   - isTty (motion): redraw a `log-update` live region, hide/restore the cursor, and spin held
//     frames on a fixed ~90ms cadence so long network steps read as working.
//   - non-tty: NO animation, NO cursor codes, NO redraw escapes. Per-phase transient lines route to
//     `onOutput` (Pi's widget path); the settled final frame is written exactly once. This non-tty
//     contract is load-bearing for Pi correctness.
//
// Determinism comes from two injected seams: a `StreamClock` (so tests record/advance dwell instead of
// sleeping) and a `StreamWriter` (so tests capture emitted strings instead of touching `process.stdout`).

import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import { createLogUpdate } from "log-update";

import { stripAnsi } from "../ansi.ts";
import type { Caps } from "../caps.ts";

/** Spinner repaint cadence, independent of how long a step actually takes. */
export const SPINNER_FRAME_MS = 90;

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";

/**
 * Realistic dwell for a single subprocess line. Network round-trips (push / create / update / fetch /
 * submit) linger noticeably; local work is quick. Keeps the stream from flashing past faster than real
 * work would. Mirrors the harness rule exactly.
 */
export function lineDwellMs(line: string, tickMs: number): number {
	return /^(?:Pushing|Creating|Updating|Fetching|Submitting)\b/.test(line)
		? Math.round(tickMs * 2.6)
		: tickMs;
}

/** Injected clock so cadence is deterministic in tests; the default sleeps for real. */
export interface StreamClock {
	sleep(ms: number): Promise<void>;
}

/** The real clock, backed by ns's timer scheduler seam. */
export const systemStreamClock: StreamClock = {
	async sleep(ms: number): Promise<void> {
		await systemTimerScheduler.delay(ms);
	},
};

/**
 * Output seam. `write` is a raw stream write (cursor toggles + the settled/non-tty block); `redraw`
 * repaints the tty live region in place; `done` atomically persists the supplied final frame and ends
 * in-place updates. The default is backed by `log-update`.
 */
export interface StreamWriter {
	write(text: string): void;
	redraw(frame: string): void;
	done(frame: string): void;
}

/** Build the real `log-update`-backed writer. `showCursor: true` leaves the cursor to the sink. */
export function createStdoutStreamWriter(
	stream: NodeJS.WriteStream = process.stdout,
): StreamWriter {
	const update = createLogUpdate(stream, { showCursor: true });
	return {
		write: (text) => {
			stream.write(text);
		},
		redraw: (frame) => {
			update(frame);
		},
		done: (frame) => {
			update.persist(frame);
		},
	};
}

/**
 * A frame is a function of the spinner `tick`: the sink re-invokes it as the spinner advances so the
 * animation lives in one place. Returns the body lines; the sink joins and emits them.
 */
export type FrameRenderer = (tick: number) => readonly string[];

/** Inputs to a single dwell. `transient`, when present, drives non-tty `onOutput` and the dwell math. */
export interface HoldOptions {
	/** Base per-line dwell. A network-prefixed transient stretches it ~2.6x; a missing one shrinks to ~1.4x. */
	tickMs: number;
	transient?: string;
}

/** Dependencies for the sink. Every seam defaults to a real implementation so callers can omit them. */
export interface StreamSinkDeps {
	clock?: StreamClock;
	writer?: StreamWriter;
	/** Non-tty per-phase transient line callback — Pi's widget path. Defaults to a stdout line writer. */
	onOutput?: (line: string) => void;
}

/**
 * The imperative sink surface. A caller composes frames (from the theme builders) and drives the
 * lifecycle: `start` → `render`/`hold`* → `finish` → `stop`. Use `runStream` to get the cursor
 * restored on early returns and throws automatically.
 */
export interface StreamSink {
	/** Take ownership of the live region: hide the cursor (tty only). Idempotent. */
	start(): void;
	/** Replace the current animated frame. Redraws immediately (tty) or buffers it as the settled frame (non-tty). */
	render(frame: FrameRenderer): void;
	/** Dwell on the current frame, advancing the spinner each ~90ms tick (tty). Non-tty: routes `transient` to onOutput, no sleep. */
	hold(options: HoldOptions): Promise<void>;
	/** Emit the settled final lines exactly once. Persists the live region first (tty). Idempotent. */
	finish(finalLines: readonly string[]): void;
	/** Restore the cursor (tty only). Idempotent; safe to call from a finally. */
	stop(): void;
}

interface ResolvedDeps {
	clock: StreamClock;
	writer: StreamWriter;
	onOutput: (line: string) => void;
}

function resolveDeps(deps: StreamSinkDeps): ResolvedDeps {
	return {
		clock: deps.clock ?? systemStreamClock,
		writer: deps.writer ?? createStdoutStreamWriter(),
		onOutput:
			deps.onOutput ??
			((line) => {
				process.stdout.write(`${line}\n`);
			}),
	};
}

/** Dwell for one step: a transient picks the network/local rule; its absence is a quick local phase. */
function dwellFor(options: HoldOptions): number {
	return options.transient === undefined
		? Math.round(options.tickMs * 1.4)
		: lineDwellMs(options.transient, options.tickMs);
}

const EMPTY_FRAME: FrameRenderer = () => [];

export function createStreamSink(caps: Caps, deps: StreamSinkDeps): StreamSink {
	const { clock, writer, onOutput } = resolveDeps(deps);
	const canAnimate = caps.isTty;

	let currentFrame: FrameRenderer = EMPTY_FRAME;
	let tick = 0;
	let isHidden = false;
	let isRestored = false;
	let isFinished = false;

	function draw(): void {
		writer.redraw(currentFrame(tick).join("\n"));
	}

	function start(): void {
		if (!canAnimate || isHidden) return;
		writer.write(CURSOR_HIDE);
		isHidden = true;
	}

	function render(frame: FrameRenderer): void {
		currentFrame = frame;
		// Non-tty buffers silently; only the settled frame is emitted, at finish.
		if (canAnimate) draw();
	}

	async function hold(options: HoldOptions): Promise<void> {
		if (!canAnimate) {
			// No animation: surface the per-phase transient through the widget path and return at once.
			if (options.transient !== undefined) onOutput(options.transient);
			return;
		}
		const frames = Math.max(1, Math.round(dwellFor(options) / SPINNER_FRAME_MS));
		for (let f = 0; f < frames; f += 1) {
			tick += 1;
			draw();
			await clock.sleep(SPINNER_FRAME_MS);
		}
	}

	function finish(finalLines: readonly string[]): void {
		if (isFinished) return;
		isFinished = true;
		if (canAnimate) {
			// Persist the settled live region with one full erase-and-write. Passing the frame to the
			// writer avoids leaving stale rows when the final frame is shorter than the live frame.
			writer.done(currentFrame(tick).join("\n"));
			if (finalLines.length > 0) writer.write(`${finalLines.join("\n")}\n`);
			return;
		}
		// Non-tty: the settled frame plus the final block, emitted as exactly one plain write.
		const settled = currentFrame(0);
		writer.write(`${stripAnsi([...settled, ...finalLines].join("\n"))}\n`);
	}

	function stop(): void {
		if (!canAnimate || !isHidden || isRestored) return;
		writer.write(CURSOR_SHOW);
		isRestored = true;
	}

	return { start, render, hold, finish, stop };
}

/**
 * Run `body` against a fresh sink, guaranteeing the cursor is restored (tty) whether `body` returns,
 * finalizes early, or throws. This is the safe wrapper for the load-bearing cursor-restore contract;
 * `createStreamSink` remains available for callers that own their own try/finally.
 */
export async function runStream<T>(
	caps: Caps,
	deps: StreamSinkDeps,
	body: (sink: StreamSink) => Promise<T>,
): Promise<T> {
	const sink = createStreamSink(caps, deps);
	sink.start();
	try {
		return await body(sink);
	} finally {
		sink.stop();
	}
}
