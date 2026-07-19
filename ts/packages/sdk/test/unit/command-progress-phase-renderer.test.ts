import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import {
	createStreamSink,
	type StreamClock,
	type StreamSink,
	type StreamWriter,
} from "@nseng-ai/clinkr/stream";
import { createCommandProgressPhaseRenderer, type CommandEventSink } from "@nseng-ai/sdk/command";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

const PHASES = [
	{ key: "inspect", name: "Inspect", label: "inspecting…", detail: "inspected" },
	{ key: "commit", name: "Commit", label: "committing…", detail: "committed" },
] as const;

function caps(isTty: boolean): Caps {
	return { isTty, colorDepth: "none", columns: 80, canRenderUnicode: true };
}

function harness(isTty = false) {
	const writes: string[] = [];
	const redraws: string[] = [];
	const outputs: string[] = [];
	const writer: StreamWriter = {
		write: (text) => writes.push(text),
		redraw: (frame) => redraws.push(frame),
		done: (frame) => writes.push(frame),
	};
	const clock: StreamClock = { sleep: async () => await Promise.resolve() };
	const resolvedCaps = caps(isTty);
	return {
		caps: resolvedCaps,
		sink: createStreamSink(resolvedCaps, {
			writer,
			clock,
			onOutput: (line) => outputs.push(line),
		}),
		writes,
		redraws,
		outputs,
	};
}

function declare(): NsProgressPhaseEvent {
	return { type: "phases-declared", title: "checkpoint", phases: PHASES };
}

function plain(text: string): string {
	return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

describe("createCommandProgressPhaseRenderer", () => {
	test("surfaces non-tty progress and writes one settled frame", async () => {
		const capture = harness();
		const renderer = createCommandProgressPhaseRenderer(capture);

		renderer.emit(declare());
		renderer.emit({ type: "phase-started", phaseKey: "inspect" });
		renderer.emit({ type: "phase-started", phaseKey: "commit" });
		await renderer.finish();

		expect(capture.outputs).toEqual(["inspecting…", "committing…"]);
		expect(capture.writes).toHaveLength(1);
		expect(plain(capture.writes[0] ?? "")).toContain("inspected");
		expect(plain(capture.writes[0] ?? "")).toContain("committed");
	});

	test("renders tty events in place and restores the cursor", async () => {
		const capture = harness(true);
		const renderer = createCommandProgressPhaseRenderer(capture);

		renderer.emit(declare());
		renderer.emit({ type: "phase-started", phaseKey: "inspect" });
		await renderer.finish();

		expect(capture.redraws.some((frame) => plain(frame).includes("inspecting…"))).toBe(true);
		expect(capture.writes).toContain("\x1b[?25l");
		expect(capture.writes).toContain("\x1b[?25h");
	});

	test("marks the active phase failed without settling later phases", async () => {
		const capture = harness();
		const renderer = createCommandProgressPhaseRenderer(capture);

		renderer.emit(declare());
		renderer.emit({ type: "phase-started", phaseKey: "inspect" });
		await renderer.finish({ isFailed: true });

		const settled = plain(capture.writes[0] ?? "");
		expect(settled).toContain("✗ Inspect");
		expect(settled).toContain("pending");
		expect(settled).not.toContain("committed");
	});

	test("forwards live semantic events without terminal rendering or duplicate output", async () => {
		const capture = harness();
		const events: NsProgressPhaseEvent[] = [];
		const forward: CommandEventSink = { isLive: true, emit: (event) => events.push(event) };
		const renderer = createCommandProgressPhaseRenderer({
			caps: capture.caps,
			sink: capture.sink,
			forward,
		});
		const started = { type: "phase-started", phaseKey: "inspect" } as const;

		renderer.emit(declare());
		renderer.emit(started);
		await renderer.finish();

		expect(events).toEqual([
			declare(),
			started,
			{ type: "phase-done", phaseKey: "inspect" },
			{ type: "phase-done", phaseKey: "commit" },
		]);
		expect(capture.outputs).toEqual([]);
		expect(capture.writes).toEqual([]);
		expect(capture.redraws).toEqual([]);
	});

	test("forwards synthetic failure settlement to live hosts", async () => {
		const capture = harness();
		const events: NsProgressPhaseEvent[] = [];
		const renderer = createCommandProgressPhaseRenderer({
			caps: capture.caps,
			sink: capture.sink,
			forward: { isLive: true, emit: (event) => events.push(event) },
		});

		renderer.emit(declare());
		renderer.emit({ type: "phase-started", phaseKey: "inspect" });
		await renderer.finish({ isFailed: true });

		expect(events.at(-1)).toEqual({
			type: "phase-failed",
			phaseKey: "inspect",
			detail: "inspecting…",
		});
	});

	test("restores the tty cursor when final rendering throws", async () => {
		const writes: string[] = [];
		const sink: StreamSink = {
			start: () => writes.push("start"),
			render: () => {
				if (writes.includes("started")) throw new Error("render failed");
				writes.push("started");
			},
			hold: async () => await Promise.resolve(),
			finish: () => writes.push("finish"),
			stop: () => writes.push("stop"),
		};
		const renderer = createCommandProgressPhaseRenderer({ caps: caps(true), sink });
		renderer.emit(declare());

		await expect(renderer.finish()).rejects.toThrow("render failed");
		expect(writes.at(-1)).toBe("stop");
	});
});
