import { describe, expect, it } from "vitest";

import {
	createWorkflowAnalyticsRunRecoveryGateway,
	type DispatchRunAnalyticsWorld,
} from "../../src/dispatch/real-run-recovery-gateway.ts";
import { recoverDispatchWorkflowRunId } from "../../src/dispatch/run-recovery.ts";

const dispatchId = "dsp-01JABCDEF0123456789";

interface AnalyticsListParams {
	readonly attributes: Readonly<Record<string, string>>;
	readonly pagination: { readonly limit: number };
}

interface InMemoryAnalyticsState {
	readonly listing?: unknown;
	readonly listError?: Error;
}

class InMemoryAnalyticsWorld implements DispatchRunAnalyticsWorld {
	readonly listCalls: AnalyticsListParams[] = [];
	readonly analytics: NonNullable<DispatchRunAnalyticsWorld["analytics"]>;
	readonly #state: InMemoryAnalyticsState;

	constructor(state: InMemoryAnalyticsState = {}) {
		this.#state = state;
		this.analytics = {
			runs: {
				list: async (params: AnalyticsListParams): Promise<unknown> => {
					this.listCalls.push(params);
					if (this.#state.listError !== undefined) throw this.#state.listError;
					return this.#state.listing ?? { data: [] };
				},
			},
		};
	}
}

describe("createWorkflowAnalyticsRunRecoveryGateway", () => {
	it("lists run ids by the exact dispatch.id attribute with the requested match limit", async () => {
		const world = new InMemoryAnalyticsWorld({
			listing: {
				data: [{ runId: "wrun_a", status: "completed" }],
				cursor: null,
				hasMore: false,
			},
		});
		const gateway = createWorkflowAnalyticsRunRecoveryGateway(async () => world);

		const result = await gateway.listRunIdsByDispatchId({ dispatchId, maxRuns: 2 });

		expect(result).toEqual({ type: "listed", runIds: ["wrun_a"] });
		expect(world.listCalls).toEqual([
			{
				attributes: { "dispatch.id": dispatchId },
				pagination: { limit: 2 },
			},
		]);
	});

	it("feature-detects a world without Analytics support", async () => {
		const gateway = createWorkflowAnalyticsRunRecoveryGateway(async () => ({}));

		expect(await gateway.listRunIdsByDispatchId({ dispatchId, maxRuns: 2 })).toEqual({
			type: "analytics-unavailable",
		});
	});

	it("normalizes a world load failure to an error", async () => {
		const gateway = createWorkflowAnalyticsRunRecoveryGateway(async () => {
			throw new Error("world not initialized");
		});

		expect(await gateway.listRunIdsByDispatchId({ dispatchId, maxRuns: 2 })).toEqual({
			type: "error",
		});
	});

	it("normalizes an Analytics read failure to an error", async () => {
		const world = new InMemoryAnalyticsWorld({ listError: new Error("pipeline unavailable") });
		const gateway = createWorkflowAnalyticsRunRecoveryGateway(async () => world);

		expect(await gateway.listRunIdsByDispatchId({ dispatchId, maxRuns: 2 })).toEqual({
			type: "error",
		});
	});

	it("rejects a malformed vendor listing rather than passing it through", async () => {
		const world = new InMemoryAnalyticsWorld({ listing: { data: [{ runId: 42 }] } });
		const gateway = createWorkflowAnalyticsRunRecoveryGateway(async () => world);

		expect(await gateway.listRunIdsByDispatchId({ dispatchId, maxRuns: 2 })).toEqual({
			type: "error",
		});
	});

	it("recovers one run end to end through the recovery core", async () => {
		const world = new InMemoryAnalyticsWorld({
			listing: { data: [{ runId: "wrun_recovered" }], cursor: null, hasMore: false },
		});
		const gateway = createWorkflowAnalyticsRunRecoveryGateway(async () => world);

		expect(await recoverDispatchWorkflowRunId({ dispatchId }, gateway)).toEqual({
			type: "found",
			dispatchId,
			runId: "wrun_recovered",
		});
		expect(world.listCalls).toEqual([
			{
				attributes: { "dispatch.id": dispatchId },
				pagination: { limit: 2 },
			},
		]);
	});
});
