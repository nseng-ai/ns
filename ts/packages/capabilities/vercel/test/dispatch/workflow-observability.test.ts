import { describe, expect, it } from "vitest";

import {
	buildDispatchFailureAttributes,
	buildDispatchPhaseAttributes,
	buildDispatchRunningAttributes,
	buildDispatchStartAttributes,
	emitDispatchWorkflowEvent,
	type DispatchWorkflowEvent,
} from "../../src/dispatch/workflow-observability.ts";
import { writeDispatchWorkflowAttributes } from "../../workflows/dispatch-attribute-writer.ts";
import { writeDispatchWorkflowEvent } from "../../workflows/dispatch-event-writer.ts";

describe("dispatch workflow attributes", () => {
	it("builds the exact prompt initial attribute map without inventing a Dispatch ID", () => {
		expect(
			buildDispatchStartAttributes({
				revision: "0123456789abcdef0123456789abcdef01234567",
				anchorBranch: "dispatch/widget",
				anchorPrNumber: 421,
				prompt: "Rename the widget gateway methods.",
			}),
		).toEqual({
			"dispatch.kind": "prompt",
			"dispatch.anchor_pr": "421",
			"dispatch.phase": "queued",
		});
	});

	it("seeds the exact Dispatch ID attribute for a Saved Plan run", () => {
		expect(
			buildDispatchStartAttributes({
				revision: "0123456789abcdef0123456789abcdef01234567",
				anchorBranch: "dispatch/add-cache",
				anchorPrNumber: 422,
				dispatchId: "dsp_01JABCDEF0123456789",
				contextLocator: {
					namespace: "dispatch-context",
					dispatchId: "dsp_01JABCDEF0123456789",
					contextPrefix: "dsp_01JABCDEF0123456789/",
					planKey: "dsp_01JABCDEF0123456789/plan/add-cache.md",
					sourceBranch: "feature/cache",
					snapshotRef: "refs/brmem/ns/dispatch-context/feature---cache",
					snapshotCommitSha: "abcdef0123456789abcdef0123456789abcdef01",
					entryLocator:
						"refs/brmem/ns/dispatch-context/feature---cache:dsp_01JABCDEF0123456789/plan/add-cache.md",
				},
			}),
		).toEqual({
			"dispatch.kind": "plan",
			"dispatch.anchor_pr": "422",
			"dispatch.phase": "queued",
			"dispatch.id": "dsp_01JABCDEF0123456789",
		});
	});

	it("builds only closed phase, harness, and failure-code attributes", () => {
		expect(buildDispatchPhaseAttributes("landing")).toEqual({ "dispatch.phase": "landing" });
		expect(buildDispatchRunningAttributes("pi")).toEqual({
			"dispatch.phase": "running",
			"dispatch.harness": "pi",
		});
		expect(buildDispatchFailureAttributes("harness-failed")).toEqual({
			"dispatch.phase": "failed",
			"dispatch.failure_code": "harness-failed",
		});
	});

	it("writes exact attributes through the injected SDK seam", async () => {
		const writes: Array<Record<string, string | undefined>> = [];
		const logs: string[] = [];
		await writeDispatchWorkflowAttributes(buildDispatchPhaseAttributes("cleaning"), {
			writer: async (value) => {
				writes.push(value);
			},
			logSink: (value) => logs.push(value),
		});

		expect(writes).toEqual([{ "dispatch.phase": "cleaning" }]);
		expect(logs).toEqual([]);
	});

	it("contains attribute storage failures and emits only a safe marker", async () => {
		const logs: string[] = [];
		await writeDispatchWorkflowAttributes(buildDispatchFailureAttributes("landing-failed"), {
			writer: async () => {
				throw new Error("raw vendor storage failure with secret-token");
			},
			logSink: (value) => logs.push(value),
		});

		expect(logs).toEqual(['{"event":"observability_write_failed","operation":"set-attributes"}']);
		expect(logs.join("\n")).not.toContain("secret-token");
	});
});

describe("dispatch workflow status stream", () => {
	it("writes each safe event to both logs and the named status stream", async () => {
		const logs: string[] = [];
		const streamed: unknown[] = [];
		const stream = new WritableStream({
			write(chunk) {
				streamed.push(chunk);
			},
		});
		const event = {
			event: "dispatch_step_finished",
			step: "poll",
			outcome: "running",
			sandboxName: "sbx_dispatch",
			pollOrdinal: 7,
		} as const;

		await writeDispatchWorkflowEvent(event, {
			createStream: () => stream,
			logSink: (value) => logs.push(value),
		});

		expect(streamed).toEqual([event]);
		expect(logs).toEqual([
			'{"event":"dispatch_step_finished","step":"poll","outcome":"running","sandboxName":"sbx_dispatch","pollOrdinal":7}',
		]);
	});

	it("still writes the stream when the primary log sink throws", async () => {
		const streamed: unknown[] = [];
		const stream = new WritableStream({
			write(chunk) {
				streamed.push(chunk);
			},
		});
		const event = {
			event: "dispatch_step_started",
			step: "create-sandbox",
			anchorPrNumber: 421,
		} as const;

		await expect(
			writeDispatchWorkflowEvent(event, {
				createStream: () => stream,
				logSink: () => {
					throw new Error("broken log sink");
				},
			}),
		).resolves.toBeUndefined();
		expect(streamed).toEqual([event]);
	});

	it("contains simultaneous sink and stream failures without leaking stream details", async () => {
		const stream = new WritableStream({
			write() {
				throw new Error("raw vendor stream failure with secret-token");
			},
		});
		const attemptedLogs: string[] = [];

		await expect(
			writeDispatchWorkflowEvent(
				{ event: "dispatch_step_started", step: "launch", anchorPrNumber: 421 },
				{
					createStream: () => stream,
					logSink: (value) => {
						attemptedLogs.push(value);
						throw new Error("broken log sink");
					},
				},
			),
		).resolves.toBeUndefined();
		expect(attemptedLogs).toEqual([
			'{"event":"dispatch_step_started","step":"launch","anchorPrNumber":421}',
			'{"event":"observability_write_failed","operation":"status-stream"}',
		]);
		expect(attemptedLogs.join("\n")).not.toContain("secret-token");
	});

	it("contains writer lock release failures", async () => {
		const stream = new WritableStream();
		const writer = stream.getWriter();
		Object.defineProperty(writer, "releaseLock", {
			value() {
				throw new Error("release failed");
			},
		});
		Object.defineProperty(stream, "getWriter", { value: () => writer });

		await expect(
			writeDispatchWorkflowEvent(
				{ event: "observability_write_failed", operation: "status-stream" },
				{ createStream: () => stream, logSink: () => {} },
			),
		).resolves.toBeUndefined();
	});

	it("contains stream failures without hiding the primary log event", async () => {
		const logs: string[] = [];
		const stream = new WritableStream({
			write() {
				throw new Error("vendor stream failure with secret-token");
			},
		});

		await writeDispatchWorkflowEvent(
			{ event: "dispatch_step_started", step: "launch", anchorPrNumber: 421 },
			{ createStream: () => stream, logSink: (value) => logs.push(value) },
		);

		expect(logs).toEqual([
			'{"event":"dispatch_step_started","step":"launch","anchorPrNumber":421}',
			'{"event":"observability_write_failed","operation":"status-stream"}',
		]);
		expect(logs.join("\n")).not.toContain("secret-token");
	});
});

describe("dispatch workflow logs", () => {
	it("contains a throwing event sink", () => {
		expect(() =>
			emitDispatchWorkflowEvent({ event: "dispatch_step_started", step: "create-sandbox" }, () => {
				throw new Error("broken sink");
			}),
		).not.toThrow();
	});

	it("contains event serialization failure", () => {
		const event = Object.defineProperty(
			{ event: "dispatch_step_started", step: "create-sandbox" },
			"toJSON",
			{
				value() {
					throw new Error("serialization failed");
				},
			},
		) as DispatchWorkflowEvent;

		expect(() => emitDispatchWorkflowEvent(event, () => {})).not.toThrow();
	});

	it("serializes only the closed safe event fields", () => {
		const output: string[] = [];
		emitDispatchWorkflowEvent(
			{
				event: "dispatch_step_finished",
				step: "poll",
				outcome: "running",
				sandboxName: "sbx_dispatch",
				pollOrdinal: 7,
			},
			(serialized) => output.push(serialized),
		);

		expect(output).toEqual([
			'{"event":"dispatch_step_finished","step":"poll","outcome":"running","sandboxName":"sbx_dispatch","pollOrdinal":7}',
		]);
	});

	it("carries only the normalized diagnostic contract on terminal failure", () => {
		const serialized: string[] = [];
		emitDispatchWorkflowEvent(
			{
				event: "dispatch_terminal_failure",
				code: "launch-failed",
				message: "Sandbox creation failed. Code: launch-failed. Operation: create_sandbox.",
				diagnostic: {
					operation: "create_sandbox",
					reason: "unexpected-exception",
					errorName: "Error",
				},
			},
			(value) => serialized.push(value),
		);

		const output = serialized.join("\n");
		for (const sensitiveMarker of [
			"plaintext prompt",
			"secret-token",
			"decision log",
			"command stdout",
			"raw vendor error",
		]) {
			expect(output).not.toContain(sensitiveMarker);
		}
	});
});
