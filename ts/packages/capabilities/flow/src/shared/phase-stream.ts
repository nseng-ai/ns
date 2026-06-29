// The flow-side presentation driver for live, multi-phase progress (`flow submit` / `flow cp`).
//
// Reference driver for the STREAMING shape in the consolidated house style; the normative rules
// (bold title, two-tier phase label/detail, log-tail, in-place TTY vs settled non-TTY frame) live
// in `.sdl/objectives/cli-ux-north-star/house-style.md`.
//
// Flow owns the ordered phase list and typed progress events. This module wires the small stream seams
// together: phase-state transitions, transcript tail buffering, lifecycle cleanup, and clinkr-backed
// TTY/non-TTY rendering. Lower layers stay domain-pure and emit `SdlProgressPhaseEvent`s keyed by stable
// `phaseKey`s.
//
// This is the one `flow → clinkr` edge. The event type lives in `sdl-sdk`, so clinkr stays free
// of any `@sdl/*` dependency and is never imported by graphite.
//
// Flow resolves streaming `Caps` from its command host context when present; direct command execution
// falls back to the real process terminal.

import {
	CLINKR_CAPS_EXTENSION_KEY,
	readCapsFromHostExtension,
	resolveProcessCaps,
	resolveSettledNonInteractiveCaps,
	type Caps,
} from "@sdl/clinkr";
import {
	createStdoutStreamWriter,
	createStreamSink,
	systemStreamClock,
	type StreamSinkDeps,
} from "@sdl/clinkr/stream";
import type { SdlProgressPhaseEvent } from "sdl-sdk";
import type { SdlExtensionApi } from "sdl-sdk";

import { createFlowLiveOutput } from "./live-output.ts";
import { createPhaseStreamLifecycle } from "./phase-stream-lifecycle.ts";
import { createPhaseStreamRenderer } from "./phase-stream-renderer.ts";
import type { PhaseSpec } from "./phase-stream-specs.ts";
import { createPhaseStateStore } from "./phase-stream-state.ts";
import { createTranscriptTail } from "./phase-stream-tail.ts";

export { checkpointEventLabel, CP_PHASES, SUBMIT_PHASES } from "./phase-stream-specs.ts";
export type { PhaseSpec } from "./phase-stream-specs.ts";

/** The driver surface a command drives: title once, feed events, finalize. */
export interface PhaseStream {
	/** Take ownership of the live region and start the spinner pump (TTY only). */
	begin(title: string): void;
	/** The `onPhase` listener: advance the phase list and repaint / emit a transient. */
	emit(event: SdlProgressPhaseEvent): void;
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
	/** Stop the spinner pump and restore the cursor without emitting a settled frame. Idempotent. */
	stop(): Promise<void>;
}

export function createPhaseStream(
	caps: Caps,
	specs: readonly PhaseSpec[],
	deps: StreamSinkDeps,
): PhaseStream {
	const sink = createStreamSink(caps, deps);
	const phases = createPhaseStateStore(specs);
	const tail = createTranscriptTail();
	const lifecycle = createPhaseStreamLifecycle(caps, sink);
	const renderer = createPhaseStreamRenderer({
		caps,
		sink,
		views: phases.views,
		tailLine: tail.line,
	});

	function begin(title: string): void {
		renderer.setTitle(title);
		lifecycle.startLiveRegion();
		renderer.render();
		lifecycle.startPump();
	}

	function emit(event: SdlProgressPhaseEvent): void {
		const transition = phases.apply(event);
		switch (transition.type) {
			case "ignored":
				return;
			case "surface":
				renderer.surface(transition.line);
				return;
			case "render":
				if (transition.clearTranscript) tail.clear();
				renderer.render();
				return;
		}
	}

	function note(text: string): void {
		if (!caps.isTty) return;
		tail.note(text);
		renderer.render();
	}

	function fail(): void {
		phases.failActive();
		renderer.render();
	}

	async function stop(): Promise<void> {
		await lifecycle.stop();
	}

	async function finish(finalLines: readonly string[] = []): Promise<void> {
		await lifecycle.drainPump();
		// On overall success, settle every still-open phase; a failure leaves its red row standing.
		phases.settleOpenPhases();
		// The persisted region must not carry a transient transcript line; the settled phases stand alone.
		tail.clear();
		renderer.render();
		sink.finish(finalLines);
		await lifecycle.stop();
	}

	return { begin, emit, note, fail, finish, stop };
}

export interface RunPhaseStreamOptions<T> {
	caps: Caps;
	specs: readonly PhaseSpec[];
	deps: StreamSinkDeps;
	title: string;
	body: (stream: PhaseStream) => Promise<T>;
}

export async function runPhaseStream<T>(options: RunPhaseStreamOptions<T>): Promise<T> {
	const stream = createPhaseStream(options.caps, options.specs, options.deps);
	stream.begin(options.title);
	try {
		return await options.body(stream);
	} finally {
		await stream.stop();
	}
}

/** Resolve flow streaming caps from the command host context, falling back only for direct CLI runs. */
export function resolveFlowStreamCaps(ctx: SdlExtensionApi): Caps {
	const hostCaps = readCapsFromHostExtension(ctx.extensions?.[CLINKR_CAPS_EXTENSION_KEY]);
	if (hostCaps !== undefined) return hostCaps;
	if (ctx.onOutput !== undefined || ctx.stdout !== undefined || ctx.stderr !== undefined) {
		return resolveSettledNonInteractiveCaps(ctx.env);
	}
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
