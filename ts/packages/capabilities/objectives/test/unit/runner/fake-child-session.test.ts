// ADR0024-LEGACY-DELETE(whole file): tests for the legacy blocking runner-step machinery.
import { describe, expect, test } from "vitest";

import type {
	ChildSessionEvent,
	ChildSessionOutcome,
	ChildSessionRequest,
} from "../../../src/runner/child-session.ts";
import { FakeChildSessionGateway } from "../../../src/runner/fake-child-session.ts";
import { collectAsync } from "./support.ts";

const COMPLETED_OUTCOME: ChildSessionOutcome = {
	type: "completed",
	exitCode: 0,
	finalText: "report body",
	stderrTail: "",
};

describe("FakeChildSessionGateway", () => {
	test("replays scripted events in order through the handle's AsyncIterable", async () => {
		const events: readonly ChildSessionEvent[] = [
			{ type: "activity", line: "child started" },
			{ type: "stderr", text: "warning: something" },
			{ type: "activity", line: "child finished" },
		];
		const gateway = new FakeChildSessionGateway([{ events, outcome: COMPLETED_OUTCOME }]);

		const handle = gateway.dispatch(requestFixture());

		expect(await collectAsync(handle.events)).toEqual(events);
	});

	test("resolves outcome to the scripted outcome", async () => {
		const outcome: ChildSessionOutcome = {
			type: "completed",
			exitCode: 1,
			finalText: "blocked report",
			stderrTail: "tail",
			stopReason: "end_turn",
			sessionFile: "/tmp/session.jsonl",
		};
		const gateway = new FakeChildSessionGateway([{ outcome }]);

		const handle = gateway.dispatch(requestFixture());

		await collectAsync(handle.events);
		expect(await handle.outcome).toEqual(outcome);
	});

	test("runs onDispatch before events replay", async () => {
		const order: string[] = [];
		const gateway = new FakeChildSessionGateway([
			{
				events: [{ type: "activity", line: "after mutation" }],
				outcome: COMPLETED_OUTCOME,
				onDispatch: async () => {
					// Yield so out-of-order replay would be caught, not masked.
					await Promise.resolve();
					order.push("onDispatch");
				},
			},
		]);

		const handle = gateway.dispatch(requestFixture());
		for await (const event of handle.events) {
			order.push(`event:${event.type}`);
		}

		expect(order).toEqual(["onDispatch", "event:activity"]);
	});

	test("passes the dispatched request to onDispatch", async () => {
		let seenRequest: ChildSessionRequest | undefined;
		const gateway = new FakeChildSessionGateway([
			{
				outcome: COMPLETED_OUTCOME,
				onDispatch: (request) => {
					seenRequest = request;
				},
			},
		]);

		const handle = gateway.dispatch(requestFixture({ prompt: "do the slice" }));

		await handle.outcome;
		expect(seenRequest?.prompt).toBe("do the slice");
	});

	test("records dispatch requests on dispatchCalls", () => {
		const gateway = new FakeChildSessionGateway([
			{ outcome: COMPLETED_OUTCOME },
			{ outcome: COMPLETED_OUTCOME },
		]);

		gateway.dispatch(requestFixture({ prompt: "first", model: "opus", timeoutMs: 1_000 }));
		gateway.dispatch(requestFixture({ prompt: "second" }));

		expect(gateway.dispatchCalls).toEqual([
			{ cwd: "/repo", prompt: "first", model: "opus", timeoutMs: 1_000 },
			{ cwd: "/repo", prompt: "second" },
		]);
	});

	test("consecutive dispatch calls consume scripts in order", async () => {
		const gateway = new FakeChildSessionGateway([
			{ events: [{ type: "activity", line: "one" }], outcome: COMPLETED_OUTCOME },
			{
				events: [{ type: "activity", line: "two" }],
				outcome: { type: "timed-out", stderrTail: "tail" },
			},
		]);

		const first = gateway.dispatch(requestFixture());
		const second = gateway.dispatch(requestFixture());

		expect(await collectAsync(first.events)).toEqual([{ type: "activity", line: "one" }]);
		expect(await collectAsync(second.events)).toEqual([{ type: "activity", line: "two" }]);
		expect(await first.outcome).toEqual(COMPLETED_OUTCOME);
		expect(await second.outcome).toEqual({ type: "timed-out", stderrTail: "tail" });
	});

	test("dispatch beyond the scripted count yields a loud startup-failed outcome", async () => {
		const gateway = new FakeChildSessionGateway([{ outcome: COMPLETED_OUTCOME }]);
		await gateway.dispatch(requestFixture()).outcome;

		const exhausted = gateway.dispatch(requestFixture());

		expect(await collectAsync(exhausted.events)).toEqual([]);
		const outcome = await exhausted.outcome;
		expect(outcome.type).toBe("startup-failed");
		if (outcome.type === "startup-failed") {
			expect(outcome.message).toContain("out of scripts");
			expect(outcome.message).toContain("dispatch call 2");
			expect(outcome.message).toContain("1 scripted dispatch(es)");
		}
	});

	test("an onDispatch failure resolves to startup-failed instead of rejecting", async () => {
		const gateway = new FakeChildSessionGateway([
			{
				events: [{ type: "activity", line: "never delivered" }],
				outcome: COMPLETED_OUTCOME,
				onDispatch: () => {
					throw new Error("repo mutation failed");
				},
			},
		]);

		const handle = gateway.dispatch(requestFixture());

		expect(await collectAsync(handle.events)).toEqual([]);
		expect(await handle.outcome).toEqual({
			type: "startup-failed",
			message: "FakeChildSessionGateway onDispatch threw: repo mutation failed",
		});
	});
});

function requestFixture(overrides: Partial<ChildSessionRequest> = {}): ChildSessionRequest {
	return { cwd: "/repo", prompt: "implement the next slice", ...overrides };
}
