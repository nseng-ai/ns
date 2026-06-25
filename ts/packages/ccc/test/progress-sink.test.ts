import { describe, expect, test } from "vitest";
import {
	createForwardingProgressSink,
	createStderrProgressSink,
	createStatusProgressSink,
} from "../src/progress-sink.ts";

describe("createForwardingProgressSink", () => {
	test("prefers the transient onOutput channel when present", () => {
		const live: Array<{ stream: string; text: string }> = [];
		const stderr: string[] = [];
		const sink = createForwardingProgressSink({
			onOutput: (stream, text) => live.push({ stream, text }),
			stderr: (text) => stderr.push(text),
		});

		sink.phase("Inspecting worktree…");

		expect(live).toEqual([{ stream: "stderr", text: "Inspecting worktree…\n" }]);
		expect(stderr).toEqual([]);
	});

	test("falls back to stderr when no transient channel exists", () => {
		const stderr: string[] = [];
		const sink = createForwardingProgressSink({ stderr: (text) => stderr.push(text) });

		sink.phase("Drafting checkpoint message…");

		expect(stderr).toEqual(["Drafting checkpoint message…\n"]);
	});

	test("is a no-op when neither channel is available", () => {
		const sink = createForwardingProgressSink({});
		expect(() => sink.phase("Creating Graphite branch and checkpoint…")).not.toThrow();
	});
});

describe("createStderrProgressSink", () => {
	test("writes one trimmed line per phase", () => {
		const stderr: string[] = [];
		const sink = createStderrProgressSink((text) => stderr.push(text));

		sink.phase("Checking out branch slot…");

		expect(stderr).toEqual(["Checking out branch slot…\n"]);
	});
});

describe("createStatusProgressSink", () => {
	test("sets transient status on phase and clears it on clear", () => {
		const statuses: Array<string | undefined> = [];
		const sink = createStatusProgressSink((value) => statuses.push(value));

		sink.phase("Inspecting worktree…");
		sink.clear?.();

		expect(statuses).toEqual(["Inspecting worktree…", undefined]);
	});
});
