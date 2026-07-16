import { describe, expect, it } from "vitest";

import {
	DISPATCH_RUN_RECOVERY_MATCH_LIMIT,
	recoverDispatchWorkflowRunId,
	type DispatchRunRecoveryGateway,
	type DispatchRunRecoveryListResult,
} from "../../src/dispatch/run-recovery.ts";

const dispatchId = "dsp-01JABCDEF0123456789";

class InMemoryDispatchRunRecoveryGateway implements DispatchRunRecoveryGateway {
	readonly listCalls: Array<{ dispatchId: string; maxRuns: number }> = [];
	readonly #result: DispatchRunRecoveryListResult;

	constructor(result: DispatchRunRecoveryListResult) {
		this.#result = result;
	}

	async listRunIdsByDispatchId(options: {
		readonly dispatchId: string;
		readonly maxRuns: number;
	}): Promise<DispatchRunRecoveryListResult> {
		this.listCalls.push({ dispatchId: options.dispatchId, maxRuns: options.maxRuns });
		return this.#result;
	}
}

function listedGateway(runIds: readonly string[]): InMemoryDispatchRunRecoveryGateway {
	return new InMemoryDispatchRunRecoveryGateway({ type: "listed", runIds });
}

describe("recoverDispatchWorkflowRunId", () => {
	it("recovers exactly one matching run by exact Dispatch ID with at most two requested matches", async () => {
		const gateway = listedGateway(["wrun_recovered"]);

		const outcome = await recoverDispatchWorkflowRunId({ dispatchId }, gateway);

		expect(outcome).toEqual({ type: "found", dispatchId, runId: "wrun_recovered" });
		expect(gateway.listCalls).toEqual([{ dispatchId, maxRuns: DISPATCH_RUN_RECOVERY_MATCH_LIMIT }]);
		expect(DISPATCH_RUN_RECOVERY_MATCH_LIMIT).toBe(2);
	});

	it("reports zero matches explicitly rather than guessing", async () => {
		expect(await recoverDispatchWorkflowRunId({ dispatchId }, listedGateway([]))).toEqual({
			type: "not-found",
			dispatchId,
		});
	});

	it("reports multiple matches explicitly with the requested matches as evidence", async () => {
		expect(
			await recoverDispatchWorkflowRunId({ dispatchId }, listedGateway(["wrun_a", "wrun_b"])),
		).toEqual({
			type: "ambiguous",
			dispatchId,
			matchedRunIds: ["wrun_a", "wrun_b"],
		});
	});

	it("stays ambiguous when a misbehaving adapter returns more matches than requested", async () => {
		expect(
			await recoverDispatchWorkflowRunId(
				{ dispatchId },
				listedGateway(["wrun_a", "wrun_b", "wrun_c"]),
			),
		).toEqual({
			type: "ambiguous",
			dispatchId,
			matchedRunIds: ["wrun_a", "wrun_b"],
		});
	});

	it("treats duplicate records of the same run id as one match", async () => {
		expect(
			await recoverDispatchWorkflowRunId({ dispatchId }, listedGateway(["wrun_a", "wrun_a"])),
		).toEqual({ type: "found", dispatchId, runId: "wrun_a" });
	});

	it("treats an unsafe vendor run id as a lookup failure rather than passing it through", async () => {
		expect(await recoverDispatchWorkflowRunId({ dispatchId }, listedGateway(["wrun ok?"]))).toEqual(
			{ type: "lookup-failed", dispatchId },
		);
	});

	it("surfaces missing Analytics support as its own outcome", async () => {
		const gateway = new InMemoryDispatchRunRecoveryGateway({ type: "analytics-unavailable" });

		expect(await recoverDispatchWorkflowRunId({ dispatchId }, gateway)).toEqual({
			type: "analytics-unavailable",
			dispatchId,
		});
	});

	it("normalizes a gateway read failure to lookup-failed", async () => {
		const gateway = new InMemoryDispatchRunRecoveryGateway({ type: "error" });

		expect(await recoverDispatchWorkflowRunId({ dispatchId }, gateway)).toEqual({
			type: "lookup-failed",
			dispatchId,
		});
	});

	it("rejects an empty Dispatch ID before touching the gateway", async () => {
		const gateway = listedGateway(["wrun_a"]);

		const outcome = await recoverDispatchWorkflowRunId({ dispatchId: "" }, gateway);

		expect(outcome.type).toBe("invalid-dispatch-id");
		expect(gateway.listCalls).toEqual([]);
	});

	it("rejects an over-long Dispatch ID before touching the gateway", async () => {
		const gateway = listedGateway(["wrun_a"]);

		const outcome = await recoverDispatchWorkflowRunId({ dispatchId: "d".repeat(201) }, gateway);

		expect(outcome.type).toBe("invalid-dispatch-id");
		expect(gateway.listCalls).toEqual([]);
	});
});
