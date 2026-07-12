// Terminal-emulation guard for the streaming sink: instead of asserting which writer methods were
// called, this suite drives the REAL `log-update`-backed writer (`createStdoutStreamWriter`) and
// feeds every emitted byte into a headless xterm terminal, then asserts on what the terminal
// finally displays — including scrollback, where stale live-region rows end up when settlement
// goes wrong. This is the seam that produced duplicated `ns flow squash-stack` matrix rows: unit
// tests saw correct renderer state while the terminal kept extra rows on screen.

import { Writable } from "node:stream";

import { Terminal } from "@xterm/headless";
import { describe, expect, test } from "vitest";

import type { Caps } from "../../src/caps.ts";
import {
	createStdoutStreamWriter,
	createStreamSink,
	type StreamSink,
} from "../../src/stream/index.ts";

const INSTANT_CLOCK = { sleep: async () => {} };

interface EmulatedTerminal {
	sink: StreamSink;
	write(text: string): void;
	/** Flush captured sink output into the emulator and return every buffer line (screen + scrollback). */
	lines(): Promise<readonly string[]>;
}

interface EmulatedTerminalOptions {
	columns: number;
	rows: number;
	/**
	 * Width the WRITER believes the terminal has (`stream.columns` and `Caps.columns`), when it
	 * differs from the emulator's real width. Models the desync a stale `process.stdout.columns`
	 * (missed resize, multiplexer pane) produces in real terminals.
	 */
	reportedColumns?: number;
}

function ttyCaps(columns: number): Caps {
	return { isTty: true, colorDepth: "none", columns, canRenderUnicode: true };
}

/**
 * A sink writing through the real log-update writer into an in-memory TTY-shaped stream, paired
 * with a headless xterm of the same geometry. Assertions read the emulator's full buffer, so a
 * row duplicated into scrollback is visible to the test exactly as it is to a user.
 */
function createEmulatedTerminal(options: EmulatedTerminalOptions): EmulatedTerminal {
	const reportedColumns = options.reportedColumns ?? options.columns;
	const chunks: string[] = [];
	const stream = new (class extends Writable {
		readonly isTTY = true;
		readonly columns = reportedColumns;
		readonly rows = options.rows;
		override _write(
			chunk: Buffer | string,
			_encoding: BufferEncoding,
			callback: (error?: Error | null) => void,
		): void {
			chunks.push(String(chunk));
			callback();
		}
	})();
	const terminal = new Terminal({
		cols: options.columns,
		rows: options.rows,
		scrollback: 1000,
		allowProposedApi: true,
		// Model the PTY line discipline (ONLCR): a real TTY translates "\n" to "\r\n" before the
		// terminal sees it. Without this, bare newlines staircase and every assertion is noise.
		convertEol: true,
	});
	const sink = createStreamSink(ttyCaps(reportedColumns), {
		writer: createStdoutStreamWriter(stream),
		clock: INSTANT_CLOCK,
	});

	async function lines(): Promise<readonly string[]> {
		await new Promise<void>((resolve) => {
			terminal.write(chunks.join(""), resolve);
		});
		const buffer = terminal.buffer.active;
		const all: string[] = [];
		for (let index = 0; index < buffer.length; index += 1) {
			all.push(buffer.getLine(index)?.translateToString(true) ?? "");
		}
		return all;
	}

	return { sink, write: (text) => stream.write(text), lines };
}

function occurrences(lines: readonly string[], marker: string): number {
	return lines.filter((line) => line.includes(marker)).length;
}

// Frame fixtures shaped like the squash-stack matrix: a live frame carries transient
// operations/tail rows beneath the matrix; the settled frame drops them and is SHORTER.
const LIVE_FRAME = [
	"ns flow squash-stack",
	"  * Plan          counting commits per branch",
	"  * Restore",
	"",
	"Branch / PR                           Commits  Squash",
	"feature/top                              2       2->1",
	"feature/bottom                           2       2->1",
	"",
	"       Squashing feature/bottom.",
];

const SETTLED_FRAME = [
	"ns flow squash-stack",
	"  + Plan          2 branches planned",
	"  + Restore       tip restored",
	"",
	"Branch / PR                           Commits  Squash",
	"feature/top                              2       2->1",
	"feature/bottom                           2       2->1",
];

const FINAL_LINES = ["", "Processed 2 Graphite stack branches; 4 commits became 2 (2 removed)."];

describe("stream sink through a headless terminal", () => {
	test("shrinking settlement leaves each matrix row exactly once (squash-stack regression)", async () => {
		const emulated = createEmulatedTerminal({ columns: 100, rows: 30 });

		emulated.sink.start();
		emulated.sink.render(() => LIVE_FRAME);
		await emulated.sink.hold({ tickMs: 90, transient: "Squashing feature/bottom." });
		emulated.sink.render(() => SETTLED_FRAME);
		emulated.sink.finish(FINAL_LINES);
		emulated.sink.stop();

		const lines = await emulated.lines();
		expect(occurrences(lines, "feature/top")).toBe(1);
		expect(occurrences(lines, "feature/bottom")).toBe(1);
		expect(occurrences(lines, "Branch / PR")).toBe(1);
		expect(occurrences(lines, "Processed 2 Graphite stack branches")).toBe(1);
		// Transient live-only rows must not survive settlement anywhere in the buffer.
		expect(occurrences(lines, "Squashing feature/bottom.")).toBe(0);
	});

	test("growing frames settle without duplicating earlier rows", async () => {
		const emulated = createEmulatedTerminal({ columns: 100, rows: 30 });

		emulated.sink.start();
		emulated.sink.render(() => LIVE_FRAME.slice(0, 5));
		await emulated.sink.hold({ tickMs: 90 });
		emulated.sink.render(() => LIVE_FRAME);
		await emulated.sink.hold({ tickMs: 90 });
		emulated.sink.render(() => SETTLED_FRAME);
		emulated.sink.finish(FINAL_LINES);
		emulated.sink.stop();

		const lines = await emulated.lines();
		expect(occurrences(lines, "ns flow squash-stack")).toBe(1);
		expect(occurrences(lines, "Branch / PR")).toBe(1);
		expect(occurrences(lines, "feature/top")).toBe(1);
	});

	test("frame lines wider than the terminal wrap without duplication", async () => {
		const columns = 30;
		const emulated = createEmulatedTerminal({ columns, rows: 24 });
		const wideLive = ["WRAP-TITLE", `WRAP-ROW-1 ${"x".repeat(60)}`, "WRAP-TAIL transient"];
		const wideSettled = ["WRAP-TITLE", `WRAP-ROW-1 ${"x".repeat(60)}`];

		emulated.sink.start();
		emulated.sink.render(() => wideLive);
		await emulated.sink.hold({ tickMs: 90 });
		emulated.sink.render(() => wideSettled);
		emulated.sink.finish(["WRAP-DONE"]);
		emulated.sink.stop();

		const lines = await emulated.lines();
		expect(occurrences(lines, "WRAP-TITLE")).toBe(1);
		expect(occurrences(lines, "WRAP-ROW-1")).toBe(1);
		expect(occurrences(lines, "WRAP-TAIL")).toBe(0);
		expect(occurrences(lines, "WRAP-DONE")).toBe(1);
	});

	test("frames taller than the terminal clip without duplicating surviving rows", async () => {
		const emulated = createEmulatedTerminal({ columns: 100, rows: 6 });

		emulated.sink.start();
		emulated.sink.render(() => LIVE_FRAME);
		await emulated.sink.hold({ tickMs: 90 });
		emulated.sink.render(() => SETTLED_FRAME.slice(4));
		emulated.sink.finish(FINAL_LINES);
		emulated.sink.stop();

		const lines = await emulated.lines();
		expect(occurrences(lines, "feature/top")).toBe(1);
		expect(occurrences(lines, "feature/bottom")).toBe(1);
		expect(occurrences(lines, "Processed 2 Graphite stack branches")).toBe(1);
	});

	// KNOWN GAP (test.fails = documented-bug characterization): when the writer's believed width
	// exceeds the terminal's real width, live-frame lines physically wrap, log-update's line
	// accounting desyncs, and settlement leaves stale rows behind — the duplicated-row artifact
	// observed in `ns flow squash-stack` under cmux/Ghostty. Atomic final-frame persistence does
	// not repair the desync because the erase distance is still counted in believed lines. When
	// the sink learns to settle correctly under width desync, this test will start passing and
	// vitest will flag it so the marker can be flipped to a regular test.
	test.fails("width desync between writer and terminal settles without stale rows", async () => {
		const emulated = createEmulatedTerminal({ columns: 40, rows: 30, reportedColumns: 100 });

		emulated.sink.start();
		emulated.sink.render(() => LIVE_FRAME);
		await emulated.sink.hold({ tickMs: 90, transient: "Squashing feature/bottom." });
		// A second live repaint with changed text, like any spinner/progress tick: the diff patch
		// is what lands on the wrong physical lines once wrapping has desynced the accounting.
		emulated.sink.render(() => [...LIVE_FRAME.slice(0, 8), "       Squashing feature/top."]);
		await emulated.sink.hold({ tickMs: 90, transient: "Squashing feature/top." });
		emulated.sink.render(() => SETTLED_FRAME);
		emulated.sink.finish(FINAL_LINES);
		emulated.sink.stop();

		const lines = await emulated.lines();
		expect(occurrences(lines, "ns flow squash-stack")).toBe(1);
		expect(occurrences(lines, "2 branches planned")).toBe(1);
		expect(occurrences(lines, "tip restored")).toBe(1);
		expect(occurrences(lines, "Squashing")).toBe(0);
	});

	test("ordinary output written immediately after settlement lands beneath the intact frame", async () => {
		const emulated = createEmulatedTerminal({ columns: 100, rows: 30 });

		emulated.sink.start();
		emulated.sink.render(() => LIVE_FRAME);
		await emulated.sink.hold({ tickMs: 90 });
		emulated.sink.render(() => SETTLED_FRAME);
		emulated.sink.finish(FINAL_LINES);
		emulated.sink.stop();
		emulated.write("NEXT-COMMAND-OUTPUT\n");

		const lines = await emulated.lines();
		const frameTitle = lines.findIndex((line) => line.includes("ns flow squash-stack"));
		const summary = lines.findIndex((line) => line.includes("Processed 2 Graphite stack"));
		const next = lines.findIndex((line) => line.includes("NEXT-COMMAND-OUTPUT"));
		expect(frameTitle).toBeGreaterThanOrEqual(0);
		expect(summary).toBeGreaterThan(frameTitle);
		expect(next).toBeGreaterThan(summary);
		expect(occurrences(lines, "NEXT-COMMAND-OUTPUT")).toBe(1);
		expect(occurrences(lines, "feature/top")).toBe(1);
	});
});
