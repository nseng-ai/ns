import { describe, expect, test } from "vitest";
import type { Caps, ColorDepth } from "../../src/caps.ts";
import {
	createStreamSink,
	lineDwellMs,
	runStream,
	SPINNER_FRAME_MS,
	type StreamClock,
	type StreamSinkDeps,
	type StreamWriter,
} from "../../src/stream/sink.ts";

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ERROR = "\x1b[38;2;248;81;73m";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸"] as const;

// Local ANSI fixtures are intentional here: @nseng-ai/clinkr owns generic stream mechanics, while
// @nseng-ai/foundation/cli-theme depends on @nseng-ai/clinkr and owns the exact house-style palette tests. Importing the
// theme package from this Clinkr test would create a reverse package edge, so these fixed literals only
// exercise sink behavior at the writer/cursor/onOutput seams.
function caps(
	parts: { isTty?: boolean; colorDepth?: ColorDepth; canRenderUnicode?: boolean } = {},
): Caps {
	return {
		isTty: parts.isTty ?? true,
		colorDepth: parts.colorDepth ?? "truecolor",
		columns: 80,
		canRenderUnicode: parts.canRenderUnicode ?? true,
	};
}

function fixtureSpinnerFrame(tick: number): string {
	return SPINNER_FRAMES[tick % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
}

function fixtureBold(text: string): string {
	return `${BOLD}${text}${RESET}`;
}

function fixtureDim(text: string): string {
	return `${DIM}${text}${RESET}`;
}

function fixtureError(text: string): string {
	return `${ERROR}${text}${RESET}`;
}

function phaseLine(state: "active" | "done" | "failed", tick = 0): string {
	switch (state) {
		case "active":
			return `  ${fixtureSpinnerFrame(tick)} Push          pushing branches`;
		case "done":
			return `  ✓ Push          ${fixtureDim("pushed 3 branches")}`;
		case "failed":
			return `  ✗ Push          ${fixtureError("pushing branches")}`;
	}
}

// Fake clock: records every requested sleep duration and resolves synchronously, so no real time
// passes and the dwell math is observable through `sleeps`.
interface RecordingClock extends StreamClock {
	readonly sleeps: number[];
}

function fakeClock(): RecordingClock {
	const sleeps: number[] = [];
	return {
		sleeps,
		async sleep(ms: number): Promise<void> {
			sleeps.push(ms);
		},
	};
}

// Fake writer: captures raw writes (cursor codes + settled output), live-region redraws, and done()
// calls separately so each seam can be asserted in isolation.
interface CapturedWriter {
	writer: StreamWriter;
	writes: string[];
	redraws: string[];
	dones: number[];
}

function fakeWriter(): CapturedWriter {
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

interface Harness {
	deps: StreamSinkDeps;
	clock: RecordingClock;
	writes: string[];
	redraws: string[];
	dones: number[];
	outputs: string[];
}

function harness(): Harness {
	const clock = fakeClock();
	const { writer, writes, redraws, dones } = fakeWriter();
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

// No cursor-control escapes: hide/show (`?25l`/`?25h`), cursor moves (CSI n A/B/C/D), or
// erase-display/line (CSI n J/K). Color/dim/bold SGR codes (CSI ... m) are allowed.
function expectNoCursorEscapes(text: string): void {
	expect(text).not.toContain(CURSOR_HIDE);
	expect(text).not.toContain(CURSOR_SHOW);
	expect(text).not.toMatch(/\x1b\[\d*[ABCD]/);
	expect(text).not.toMatch(/\x1b\[\d*[JK]/);
}

describe("lineDwellMs (network dwell rule)", () => {
	test("network-prefixed lines dwell ~2.6x a normal line", () => {
		expect(lineDwellMs("Pushing to origin", 900)).toBe(2340);
		expect(lineDwellMs("Creating PR", 900)).toBe(2340);
		expect(lineDwellMs("Updating refs", 900)).toBe(2340);
		expect(lineDwellMs("Fetching base", 900)).toBe(2340);
		expect(lineDwellMs("Submitting stack", 900)).toBe(2340);
	});

	test("local lines dwell at the base tick", () => {
		expect(lineDwellMs("Validating locally", 900)).toBe(900);
		expect(lineDwellMs("pushing (lowercase is not a network prefix)", 900)).toBe(900);
	});
});

describe("non-tty settle path (Pi correctness)", () => {
	test("emits exactly one settled frame with zero cursor escapes; routes transients to onOutput", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, clock, writes, redraws, outputs } = harness();
		const sink = createStreamSink(c, deps);

		sink.start();
		sink.render(() => [phaseLine("active", 0)]);
		await sink.hold({ tickMs: 100, transient: "Pushing to origin" });
		await sink.hold({ tickMs: 100, transient: "Validating locally" });
		sink.render(() => [phaseLine("done")]);
		sink.finish(["", fixtureBold("Submitted")]);
		sink.stop();

		// No animation in a non-tty: no live-region redraws, no clock sleeps.
		expect(redraws).toHaveLength(0);
		expect(clock.sleeps).toHaveLength(0);

		// Exactly one settled frame through the raw write seam, free of cursor control.
		expect(writes).toHaveLength(1);
		const settled = writes[0] ?? "";
		expectNoCursorEscapes(settled);
		expect(settled).toContain("Submitted");

		// Per-phase transient lines went to the widget path, NOT the live region.
		expect(outputs).toEqual(["Pushing to origin", "Validating locally"]);
	});

	test("finish is idempotent — the settled frame is emitted only once", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes } = harness();
		const sink = createStreamSink(c, deps);

		sink.render(() => ["done line"]);
		sink.finish(["final"]);
		sink.finish(["final"]);

		expect(writes).toHaveLength(1);
	});
});

describe("tty live region", () => {
	test("hides the cursor on start and restores it after stop", () => {
		const c = caps();
		const { deps, writes } = harness();
		const sink = createStreamSink(c, deps);

		sink.start();
		expect(writes).toEqual([CURSOR_HIDE]);

		sink.finish([fixtureBold("Submitted")]);
		sink.stop();

		const hideIdx = writes.indexOf(CURSOR_HIDE);
		const showIdx = writes.indexOf(CURSOR_SHOW);
		expect(hideIdx).toBeGreaterThanOrEqual(0);
		expect(showIdx).toBeGreaterThan(hideIdx);
	});

	test("redraws the live region and advances the spinner under the fake clock", async () => {
		const c = caps();
		const { deps, clock, redraws } = harness();
		const sink = createStreamSink(c, deps);

		sink.start();
		sink.render((tick: number) => [phaseLine("active", tick)]);
		await sink.hold({ tickMs: 900, transient: "Pushing to origin" });

		// Many redraws (initial + one per tick); the spinner glyph advances frame to frame.
		expect(redraws.length).toBeGreaterThan(1);
		expect(redraws[0]).not.toBe(redraws[1]);
		expect(redraws[0]).toContain(fixtureSpinnerFrame(0));
		expect(redraws[1]).toContain(fixtureSpinnerFrame(1));

		// All dwell happened through the injected clock at the spinner cadence — no real time.
		expect(clock.sleeps.length).toBeGreaterThan(0);
		expect(clock.sleeps.every((ms) => ms === SPINNER_FRAME_MS)).toBe(true);
	});

	test("finish persists the live region once and writes the settled block", async () => {
		const c = caps();
		const { deps, writes, dones } = harness();
		const sink = createStreamSink(c, deps);

		sink.start();
		sink.render((tick: number) => [phaseLine("active", tick)]);
		await sink.hold({ tickMs: 90, transient: "Validating locally" });
		sink.render(() => [phaseLine("done")]);
		sink.finish(["", fixtureBold("Submitted")]);
		sink.stop();

		expect(dones).toHaveLength(1);
		expect(writes.some((w) => w.includes("Submitted"))).toBe(true);
	});
});

describe("dwell math under the fake clock", () => {
	test("a network line dwells exactly 2.6x a normal line in recorded sleep time", async () => {
		const c = caps();

		const net = harness();
		const netSink = createStreamSink(c, net.deps);
		netSink.render((tick: number) => [phaseLine("active", tick)]);
		await netSink.hold({ tickMs: 900, transient: "Pushing to origin" });

		const local = harness();
		const localSink = createStreamSink(c, local.deps);
		localSink.render((tick: number) => [phaseLine("active", tick)]);
		await localSink.hold({ tickMs: 900, transient: "Validating locally" });

		const netTotal = net.clock.sleeps.reduce((a, b) => a + b, 0);
		const localTotal = local.clock.sleeps.reduce((a, b) => a + b, 0);

		// round(900*2.6)/90 = 26 ticks vs 900/90 = 10 ticks; total slept time is an exact 2.6x.
		expect(netTotal).toBe(2340);
		expect(localTotal).toBe(900);
		expect(netTotal).toBe(localTotal * 2.6);
	});

	test("a quick local phase (no transient) dwells ~1.4x the base tick", async () => {
		const c = caps();
		const { deps, clock } = harness();
		const sink = createStreamSink(c, deps);
		sink.render((tick: number) => [phaseLine("active", tick)]);
		await sink.hold({ tickMs: 900 });

		// round(900*1.4) = 1260 -> round(1260/90) = 14 ticks of 90ms.
		const total = clock.sleeps.reduce((a, b) => a + b, 0);
		expect(total).toBe(1260);
	});
});

describe("runStream cursor lifetime", () => {
	test("restores the cursor when the body throws (finally path)", async () => {
		const c = caps();
		const { deps, writes } = harness();

		await expect(
			runStream(c, deps, async (sink) => {
				sink.render(() => [phaseLine("active", 0)]);
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		const hideIdx = writes.indexOf(CURSOR_HIDE);
		const showIdx = writes.indexOf(CURSOR_SHOW);
		expect(hideIdx).toBeGreaterThanOrEqual(0);
		expect(showIdx).toBeGreaterThan(hideIdx);
	});

	test("emits the failure block once and still restores the cursor on early finalize", async () => {
		const c = caps();
		const { deps, writes, dones } = harness();

		await runStream(c, deps, async (sink) => {
			sink.render(() => [phaseLine("failed")]);
			sink.finish(["", fixtureError(fixtureBold("submit failed: rejected"))]);
		});

		const failWrites = writes.filter((w) => w.includes("submit failed: rejected"));
		expect(failWrites).toHaveLength(1);
		expect(dones).toHaveLength(1);
		expect(writes).toContain(CURSOR_SHOW);
	});

	test("non-tty runStream produces no cursor escapes at all", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes } = harness();

		await runStream(c, deps, async (sink) => {
			sink.render(() => [fixtureDim("working")]);
			await sink.hold({ tickMs: 50, transient: "Pushing to origin" });
			sink.finish(["done"]);
		});

		for (const w of writes) expectNoCursorEscapes(w);
		expect(writes).not.toContain(CURSOR_HIDE);
		expect(writes).not.toContain(CURSOR_SHOW);
	});
});
