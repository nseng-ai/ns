import type { Caps } from "@nseng-ai/clinkr";
import { SPINNER_FRAME_MS, type StreamSink } from "@nseng-ai/clinkr/stream";

export interface PhaseStreamLifecycle {
	startLiveRegion(): void;
	startPump(): void;
	drainPump(): Promise<void>;
	stop(): Promise<void>;
}

export function createPhaseStreamLifecycle(caps: Caps, sink: StreamSink): PhaseStreamLifecycle {
	let isRunning = false;
	let pumpPromise: Promise<void> | undefined;
	let isStopped = false;

	async function pump(): Promise<void> {
		while (isRunning) {
			await sink.hold({ tickMs: SPINNER_FRAME_MS });
		}
	}

	function startLiveRegion(): void {
		sink.start();
	}

	function startPump(): void {
		if (!caps.isTty || pumpPromise !== undefined) return;
		isRunning = true;
		pumpPromise = pump();
	}

	async function drainPump(): Promise<void> {
		isRunning = false;
		if (pumpPromise !== undefined) await pumpPromise;
	}

	async function stop(): Promise<void> {
		if (isStopped) return;
		isStopped = true;
		await drainPump();
		sink.stop();
	}

	return { startLiveRegion, startPump, drainPump, stop };
}
