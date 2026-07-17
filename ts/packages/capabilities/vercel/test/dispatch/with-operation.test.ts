import { createManualClock } from "@nseng-ai/foundation/time/testing";
import { describe, expect, it } from "vitest";

import { withOperation } from "../../src/dispatch/with-operation.ts";

function parsedEvents(lines: readonly string[]): unknown[] {
	return lines.map((line) => JSON.parse(line) as unknown);
}

describe("withOperation", () => {
	it("logs start and success with curated context and elapsed time without serializing the result", async () => {
		const manual = createManualClock(100);
		const lines: string[] = [];
		const resultValue = { secretResult: "must-not-be-logged" };

		const result = await withOperation(
			{
				operation: "read_dispatch_result",
				context: { sandboxName: "sbx_dispatch", path: ".ns/dispatch-result.json" },
				clock: manual.clock,
				logSink: (line) => lines.push(line),
			},
			async () => {
				manual.advanceMs(27);
				return resultValue;
			},
		);

		expect(result).toBe(resultValue);
		expect(parsedEvents(lines)).toEqual([
			{
				event: "operation_started",
				operation: "read_dispatch_result",
				sandboxName: "sbx_dispatch",
				path: ".ns/dispatch-result.json",
			},
			{
				event: "operation_succeeded",
				operation: "read_dispatch_result",
				durationMs: 27,
				sandboxName: "sbx_dispatch",
				path: ".ns/dispatch-result.json",
			},
		]);
		expect(lines.join("\n")).not.toContain("must-not-be-logged");
	});

	it("logs a normalized thrown diagnostic and rethrows the identical value", async () => {
		const manual = createManualClock(50);
		const lines: string[] = [];
		const thrown = new Error("sandbox SDK exploded");

		const promise = withOperation(
			{
				operation: "create_sandbox",
				clock: manual.clock,
				logSink: (line) => lines.push(line),
			},
			async () => {
				manual.advanceMs(5);
				throw thrown;
			},
		);

		await expect(promise).rejects.toBe(thrown);
		expect(parsedEvents(lines)).toEqual([
			{ event: "operation_started", operation: "create_sandbox" },
			{
				event: "operation_failed",
				operation: "create_sandbox",
				durationMs: 5,
				diagnostic: {
					operation: "create_sandbox",
					reason: "unexpected-exception",
					errorName: "Error",
					message: "sandbox SDK exploded",
				},
			},
		]);
	});

	it("logs an inspected returned failure and returns it unchanged", async () => {
		const manual = createManualClock(10);
		const lines: string[] = [];
		const failure = { ok: false, message: "HTTP 502" } as const;

		const result = await withOperation(
			{
				operation: "update_anchor_pr",
				clock: manual.clock,
				logSink: (line) => lines.push(line),
				failureMessage: (value) => (value.ok ? undefined : value.message),
			},
			async () => failure,
		);

		expect(result).toBe(failure);
		expect(parsedEvents(lines)[1]).toEqual({
			event: "operation_failed",
			operation: "update_anchor_pr",
			durationMs: 0,
			diagnostic: {
				operation: "update_anchor_pr",
				reason: "operation-returned-failure",
				message: "HTTP 502",
			},
		});
	});

	it("contains sink failures so observability does not change operation behavior", async () => {
		const manual = createManualClock(0);
		const value = { ok: true } as const;
		await expect(
			withOperation(
				{
					operation: "safe_operation",
					clock: manual.clock,
					logSink: () => {
						throw new Error("log sink unavailable");
					},
				},
				async () => value,
			),
		).resolves.toBe(value);
	});
});
