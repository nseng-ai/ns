import type { StreamClock, StreamSinkDeps, StreamWriter } from "@nseng-ai/clinkr/stream";

export interface RecordingClock extends StreamClock {
	readonly sleeps: number[];
}

export type FakeClockSleepMode = "resolve" | "pending";

export function fakeClock(options: { sleep?: FakeClockSleepMode } = {}): RecordingClock {
	const sleeps: number[] = [];
	return {
		sleeps,
		sleep(ms: number): Promise<void> {
			sleeps.push(ms);
			if (options.sleep === "pending") return new Promise<void>(() => {});
			return Promise.resolve();
		},
	};
}

export interface CapturedStreamWriter {
	writer: StreamWriter;
	writes: string[];
	redraws: string[];
	dones: number[];
}

export function fakeStreamWriter(): CapturedStreamWriter {
	const writes: string[] = [];
	const redraws: string[] = [];
	const dones: number[] = [];
	const writer: StreamWriter = {
		write: (text) => {
			writes.push(text);
		},
		redraw: (frame) => {
			redraws.push(frame);
		},
		done: () => {
			dones.push(1);
		},
	};
	return { writer, writes, redraws, dones };
}

export interface CapturedStream {
	deps: StreamSinkDeps;
	clock: RecordingClock;
	writes: string[];
	redraws: string[];
	dones: number[];
	outputs: string[];
}

export function streamCapture(options: { sleep?: FakeClockSleepMode } = {}): CapturedStream {
	const clock = fakeClock(options.sleep === undefined ? {} : { sleep: options.sleep });
	const { writer, writes, redraws, dones } = fakeStreamWriter();
	const outputs: string[] = [];
	const deps: StreamSinkDeps = {
		clock,
		writer,
		onOutput: (line) => {
			outputs.push(line);
		},
	};
	return { deps, clock, writes, redraws, dones, outputs };
}
