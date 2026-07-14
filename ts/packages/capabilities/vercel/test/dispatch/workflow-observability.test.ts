import { describe, expect, it } from "vitest";

import {
	buildDispatchFailureAttributes,
	buildDispatchPhaseAttributes,
	buildDispatchRunningAttributes,
	buildDispatchStartAttributes,
	emitDispatchWorkflowEvent,
} from "../../src/dispatch/workflow-observability.ts";
import { writeDispatchWorkflowAttributes } from "../../workflows/dispatch-attribute-writer.ts";
import { writeDispatchWorkflowEvent } from "../../workflows/dispatch-event-writer.ts";

describe("dispatch workflow attributes", () => {
	it("builds the exact low-cardinality initial attribute map", () => {
		expect(buildDispatchStartAttributes(421)).toEqual({
			"dispatch.kind": "prompt",
			"dispatch.anchor_pr": "421",
			"dispatch.phase": "queued",
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
		await writeDispatchWorkflowAttributes(
			buildDispatchPhaseAttributes("cleaning"),
			async (value) => {
				writes.push(value);
			},
		);

		expect(writes).toEqual([{ "dispatch.phase": "cleaning" }]);
	});

	it("contains attribute storage failures and emits only a safe marker", async () => {
		const logs: string[] = [];
		await writeDispatchWorkflowAttributes(
			buildDispatchFailureAttributes("landing-failed"),
			async () => {
				throw new Error("raw vendor storage failure with secret-token");
			},
			(value) => logs.push(value),
		);

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

		await writeDispatchWorkflowEvent(
			event,
			() => stream,
			(value) => logs.push(value),
		);

		expect(streamed).toEqual([event]);
		expect(logs).toEqual([
			'{"event":"dispatch_step_finished","step":"poll","outcome":"running","sandboxName":"sbx_dispatch","pollOrdinal":7}',
		]);
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
			() => stream,
			(value) => logs.push(value),
		);

		expect(logs).toEqual([
			'{"event":"dispatch_step_started","step":"launch","anchorPrNumber":421}',
			'{"event":"observability_write_failed","operation":"status-stream"}',
		]);
		expect(logs.join("\n")).not.toContain("secret-token");
	});
});

describe("dispatch workflow logs", () => {
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

	it("has no field capable of carrying prompt, token, command output, or raw errors", () => {
		const serialized: string[] = [];
		emitDispatchWorkflowEvent(
			{
				event: "dispatch_step_finished",
				step: "launch",
				outcome: "failed",
				failureCode: "launch-failed",
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
