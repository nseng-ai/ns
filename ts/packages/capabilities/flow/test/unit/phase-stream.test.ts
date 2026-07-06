import { afterEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_COLUMNS } from "@nseng-ai/clinkr";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/kernel/sdk";
import type { Caps, ColorDepth } from "@nseng-ai/clinkr";
import type { StreamClock, StreamSinkDeps, StreamWriter } from "@nseng-ai/clinkr/stream";
import { spinnerFrame } from "@nseng-ai/foundation/cli-theme";

import type { NsExtensionApi, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/kernel/sdk";

import {
	createPhaseStream,
	createPhaseStreamController,
	resolveFlowStreamCaps,
	runPhaseStream,
	runSettledPhaseStream,
	type PhaseSpec,
} from "../../src/phase-stream/phase-stream.ts";

const CURSOR_HIDE = "\x1b[?25l";
const CURSOR_SHOW = "\x1b[?25h";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

const SPECS: readonly PhaseSpec[] = [
	{ key: "a", item: { name: "Alpha", detail: "alpha done", label: "alpha working…" } },
	{ key: "b", item: { name: "Beta", detail: "beta done", label: "beta working…" } },
	{ key: "c", item: { name: "Gamma", detail: "gamma done", label: "gamma working…" } },
];

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

function recordingProgress(isLive = true): { events: NsProgressPhaseEvent[]; sink: NsProgress } {
	const events: NsProgressPhaseEvent[] = [];
	return { events, sink: { isLive, phase: (event) => events.push(event) } };
}

function ctx(overrides: Partial<NsExtensionApi> = {}): NsExtensionApi {
	return {
		cwd: "/work",
		env: {},
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
		exec: async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		...overrides,
	};
}

// Fake clock: records sleeps and resolves synchronously (copied seam from clinkr's sink.test.ts).
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

// No cursor-control escapes; SGR (color/bold/dim) are allowed.
function expectNoCursorEscapes(text: string): void {
	expect(text).not.toContain(CURSOR_HIDE);
	expect(text).not.toContain(CURSOR_SHOW);
	expect(text).not.toMatch(/\x1b\[\d*[ABCD]/);
	expect(text).not.toMatch(/\x1b\[\d*[JK]/);
}

// Let queued microtasks (the spinner pump's resumed iterations) run.
async function flush(times: number): Promise<void> {
	for (let i = 0; i < times; i += 1) await Promise.resolve();
}

describe("resolveFlowStreamCaps", () => {
	test("callback sinks resolve to settled non-interactive caps", () => {
		vi.stubEnv("FORCE_COLOR", "3");
		const resolved = resolveFlowStreamCaps(
			ctx({ env: { FORCE_COLOR: "3", LANG: "C" }, onOutput: () => undefined }),
		);

		expect(resolved).toEqual({
			isTty: false,
			colorDepth: "none",
			columns: DEFAULT_COLUMNS,
			canRenderUnicode: expect.any(Boolean),
		});
	});

	test("stdout or stderr override sinks also resolve to settled non-interactive caps", () => {
		const resolved = resolveFlowStreamCaps(
			ctx({ env: { FORCE_COLOR: "3" }, stdout: () => undefined }),
		);

		expect(resolved.isTty).toBe(false);
		expect(resolved.colorDepth).toBe("none");
		expect(resolved.columns).toBe(DEFAULT_COLUMNS);
	});

	test("explicit render capabilities caps win for override sinks", () => {
		const injected = caps({ isTty: false, colorDepth: "none", canRenderUnicode: false });
		expect(
			resolveFlowStreamCaps(ctx({ renderCapabilities: { canEmitAnsi: false, caps: injected } })),
		).toEqual(injected);
	});

	test("missing explicit caps resolves to settled non-interactive caps", () => {
		const resolved = resolveFlowStreamCaps(ctx());
		expect(resolved).toEqual({
			isTty: false,
			colorDepth: "none",
			columns: DEFAULT_COLUMNS,
			canRenderUnicode: expect.any(Boolean),
		});
	});
});

describe("forwarded progress", () => {
	test("live forward receives declarations, title updates, and phase events", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps } = harness();
		const progress = recordingProgress();
		const stream = createPhaseStream(c, SPECS, deps, progress.sink);
		const phaseEvent = { type: "phase-started", phaseKey: "a" } satisfies NsProgressPhaseEvent;

		stream.begin("title");
		stream.setTitle("updated title");
		stream.emit(phaseEvent);
		await stream.finish();

		expect(progress.events).toEqual([
			{
				type: "phases-declared",
				title: "title",
				phases: [
					{ key: "a", name: "Alpha", label: "alpha working…", detail: "alpha done" },
					{ key: "b", name: "Beta", label: "beta working…", detail: "beta done" },
					{ key: "c", name: "Gamma", label: "gamma working…", detail: "gamma done" },
				],
			},
			{ type: "title-changed", title: "updated title" },
			phaseEvent,
		]);
	});

	test("live forward suppresses non-tty transient surfaces but leaves settled output unchanged", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes, redraws, outputs } = harness();
		const progress = recordingProgress();
		const stream = createPhaseStream(c, SPECS, deps, progress.sink);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.emit({ type: "phase-progress", phaseKey: "a", label: "a progress" });
		stream.emit({ type: "phase-started", phaseKey: "b" });
		await stream.finish();

		expect(outputs).toEqual([]);
		expect(redraws).toHaveLength(0);
		expect(writes).toHaveLength(1);
		const settled = writes[0] ?? "";
		expectNoCursorEscapes(settled);
		expect(settled).toContain("alpha done");
		expect(settled).toContain("beta done");
		expect(settled).toContain("gamma done");
	});

	test("live forward preserves tty surface rendering", async () => {
		const c = caps();
		const { deps, redraws } = harness();
		const progress = recordingProgress();
		const stream = createPhaseStream(c, SPECS, deps, progress.sink);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });

		expect(redraws[redraws.length - 1]).toContain("alpha working…");
		await stream.finish();
	});

	test("inactive forward keeps non-tty transient output unchanged", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, outputs } = harness();
		const progress = recordingProgress(false);
		const stream = createPhaseStream(c, SPECS, deps, progress.sink);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.emit({ type: "phase-progress", phaseKey: "a", label: "a progress" });

		expect(progress.events).toEqual([]);
		expect(outputs).toEqual(["alpha working…", "a progress"]);
		await stream.finish();
	});
});

describe("non-tty settle path", () => {
	test("routes one transient per started/progress to onOutput and emits one settled all-done frame", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, clock, writes, redraws, outputs } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.emit({ type: "phase-progress", phaseKey: "a", label: "a progress" });
		stream.emit({ type: "phase-started", phaseKey: "b" });
		await stream.finish();

		// No animation in a non-tty: no live-region redraws, no clock sleeps.
		expect(redraws).toHaveLength(0);
		expect(clock.sleeps).toHaveLength(0);

		// Each started/progress surfaced its label through the widget path, in order.
		expect(outputs).toEqual(["alpha working…", "a progress", "beta working…"]);

		// Exactly one settled frame, free of cursor control, every phase reported done.
		expect(writes).toHaveLength(1);
		const settled = writes[0] ?? "";
		expectNoCursorEscapes(settled);
		expect(settled).toContain("alpha done");
		expect(settled).toContain("beta done");
		expect(settled).toContain("gamma done");
	});

	test("a failed phase stops the settle; later phases stay pending and the cursor is never touched", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes, redraws } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.emit({ type: "phase-started", phaseKey: "b" });
		stream.emit({ type: "phase-failed", phaseKey: "b", detail: "boom" });
		await stream.finish();

		expect(redraws).toHaveLength(0);
		expect(writes).toHaveLength(1);
		const settled = writes[0] ?? "";
		expectNoCursorEscapes(settled);
		expect(settled).toContain("alpha done"); // earlier phase inferred done when b started
		expect(settled).toContain("boom"); // failed row renders the failure detail
		expect(settled).toContain("pending"); // gamma never reached, not settled to done
		expect(settled).not.toContain("gamma done");
	});

	test("non-tty settled frame uses the latest title", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.setTitle("updated title");
		await stream.finish();

		expect(writes[0]).toContain("updated title");
	});
});

describe("inferred completion", () => {
	test("starting a later phase infers done for every skipped earlier phase", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.emit({ type: "phase-started", phaseKey: "c" }); // skip b entirely
		await stream.finish();

		const settled = writes[0] ?? "";
		expect(settled).toContain("alpha done");
		expect(settled).toContain("beta done"); // inferred, never explicitly started
		expect(settled).toContain("gamma done");
	});
});

describe("runPhaseStream lifecycle", () => {
	test("runSettledPhaseStream marks failure before settling and returns the command result", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes } = harness();

		const result = await runSettledPhaseStream({
			caps: c,
			specs: SPECS,
			deps,
			title: "title",
			body: async (stream) => {
				stream.emit({ type: "phase-started", phaseKey: "a" });
				stream.emit({ type: "phase-started", phaseKey: "b" });
				return { result: "failed-result", isFailed: true };
			},
		});

		expect(result).toBe("failed-result");
		const settled = writes[0] ?? "";
		expect(settled).toContain("alpha done");
		expect(settled).toContain("beta working…");
		expect(settled).toContain("✗");
	});

	test("lazy controller begins only when an externally routed event arrives", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes, outputs } = harness();
		const controller = createPhaseStreamController({
			caps: c,
			specs: SPECS,
			deps,
			title: "title",
			begin: "lazy",
		});

		await controller.finish();
		expect(writes).toEqual([]);
		controller.emit({ type: "phase-started", phaseKey: "a" });
		expect(outputs).toEqual(["alpha working…"]);
		await controller.finish();

		expect(writes).toHaveLength(1);
		expect(writes[0]).toContain("alpha done");
	});

	test("lazy controller accepts title updates before first event without early output", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes, outputs } = harness();
		const controller = createPhaseStreamController({
			caps: c,
			specs: SPECS,
			deps,
			title: "title",
			begin: "lazy",
		});

		controller.setTitle("updated title");
		expect(writes).toEqual([]);
		expect(outputs).toEqual([]);
		controller.emit({ type: "phase-started", phaseKey: "a" });
		await controller.finish();

		expect(writes[0]).toContain("updated title");
	});

	test("restores the cursor and stops the pump when core work throws", async () => {
		const c = caps();
		const { deps, writes } = harness();

		await expect(
			runPhaseStream({
				caps: c,
				specs: SPECS,
				deps,
				title: "title",
				body: async (stream) => {
					stream.emit({ type: "phase-started", phaseKey: "a" });
					throw new Error("mid-stream failure");
				},
			}),
		).rejects.toThrow("mid-stream failure");

		const hideIdx = writes.indexOf(CURSOR_HIDE);
		const showIdx = writes.indexOf(CURSOR_SHOW);
		expect(hideIdx).toBeGreaterThanOrEqual(0);
		expect(showIdx).toBeGreaterThan(hideIdx);
	});
});

describe("tty live region", () => {
	test("dynamic title update repaints the live header", async () => {
		const c = caps();
		const { deps, redraws } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.setTitle("updated title");

		expect(redraws[redraws.length - 1]).toContain("updated title");
		await stream.finish();
	});

	test("pump advances the spinner, events repaint at once, and the cursor is hidden then restored", async () => {
		const c = caps();
		const { deps, clock, writes, redraws, dones } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		expect(writes).toContain(CURSOR_HIDE);

		stream.emit({ type: "phase-started", phaseKey: "a" });
		await flush(6); // let the pump iterate a few frames under the fake clock

		// The pump produced multiple redraws and the spinner advanced frame to frame.
		expect(redraws.length).toBeGreaterThan(1);
		expect(redraws.some((frame) => frame.includes(spinnerFrame(c, 1)))).toBe(true);
		expect(clock.sleeps.length).toBeGreaterThan(0);

		// A started event repaints immediately: the newly active phase shows its in-flight label.
		stream.emit({ type: "phase-started", phaseKey: "b" });
		expect(redraws[redraws.length - 1]).toContain("beta working…");

		await stream.finish();

		// finish persists the region exactly once and restores the cursor after hiding it.
		expect(dones).toHaveLength(1);
		const hideIdx = writes.indexOf(CURSOR_HIDE);
		const showIdx = writes.indexOf(CURSOR_SHOW);
		expect(hideIdx).toBeGreaterThanOrEqual(0);
		expect(showIdx).toBeGreaterThan(hideIdx);
	});

	test("a raw transcript chunk rides inside the live region as a dimmed tail, never a direct write", async () => {
		const c = caps();
		const { deps, writes, redraws } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		const writesBeforeNote = writes.length;

		// The freshest transcript line shows; a CR-updated progress line replaces the prior one in place.
		stream.note("Pushing branch…\n");
		expect(redraws[redraws.length - 1]).toContain("Pushing branch…");
		stream.note("Submitting…25%\rSubmitting…80%");
		const afterNote = redraws[redraws.length - 1] ?? "";
		expect(afterNote).toContain("Submitting…80%");
		expect(afterNote).not.toContain("25%"); // CR overwrote the earlier progress, it is not appended

		// The transcript reached the region ONLY through the writer's redraws — nothing bypassed it to
		// a raw stdout write. This is the regression guard: the old path wrote straight to stdout.
		expect(writes.length).toBe(writesBeforeNote);

		await stream.finish();

		// The persisted settled frame is clean: the transient transcript tail is gone once phases settle.
		const settled = redraws[redraws.length - 1] ?? "";
		expect(settled).not.toContain("Submitting…80%");
	});

	test("a phase-done clears the transcript tail so it does not bleed into the next phase", async () => {
		const c = caps();
		const { deps, redraws } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.note("creating PR…\n");
		expect(redraws[redraws.length - 1]).toContain("creating PR…");

		stream.emit({ type: "phase-done", phaseKey: "a" });
		expect(redraws[redraws.length - 1]).not.toContain("creating PR…");

		await stream.finish(); // stop the spinner pump (the fake clock resolves synchronously)
	});

	test("note is a no-op in a non-tty: the transcript routes to the context instead", async () => {
		const c = caps({ isTty: false, colorDepth: "none" });
		const { deps, writes, redraws, outputs } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.note("Pushing branch…\n");

		// Non-tty owns no live region, so note neither redraws nor writes nor surfaces a transient.
		expect(redraws).toHaveLength(0);
		expect(writes).toHaveLength(0);
		expect(outputs).toHaveLength(0);
	});

	test("fail marks the active phase and the final repaint shows it failed", async () => {
		const c = caps();
		const { deps, writes, redraws } = harness();
		const stream = createPhaseStream(c, SPECS, deps);

		stream.begin("title");
		stream.emit({ type: "phase-started", phaseKey: "a" });
		stream.emit({ type: "phase-started", phaseKey: "b" });
		stream.fail();
		await stream.finish();

		// The failed row keeps beta's in-flight label, rendered in the final live-region frame.
		const settled = redraws[redraws.length - 1] ?? "";
		expect(settled).toContain("beta working…");
		expect(settled).toContain("✗"); // failure glyph on the active row
		expect(writes).toContain(CURSOR_SHOW);
	});
});
