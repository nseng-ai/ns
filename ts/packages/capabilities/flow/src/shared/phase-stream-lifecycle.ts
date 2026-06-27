import type { Caps } from "@sdl/clinkr";
import { SPINNER_FRAME_MS, type StreamSink } from "@sdl/clinkr/stream";

export interface PhaseStreamLifecycle {
	startLiveRegion(): void;
	startPump(): void;
	drainPump(): Promise<void>;
	stop(): Promise<void>;
}

export function createPhaseStreamLifecycle(caps: Caps, sink: StreamSink): PhaseStreamLifecycle {
	let running = false;
	let pumpPromise: Promise<void> | undefined;
	let stopped = false;

	async function pump(): Promise<void> {
		while (running) {
			await sink.hold({ tickMs: SPINNER_FRAME_MS });
		}
	}

	function startLiveRegion(): void {
		sink.start();
	}

	function startPump(): void {
		if (!caps.isTty || pumpPromise !== undefined) return;
		running = true;
		pumpPromise = pump();
	}

	async function drainPump(): Promise<void> {
		running = false;
		if (pumpPromise !== undefined) await pumpPromise;
	}

	async function stop(): Promise<void> {
		if (stopped) return;
		stopped = true;
		await drainPump();
		sink.stop();
	}

	return { startLiveRegion, startPump, drainPump, stop };
}
