import { WorkflowRunNotFoundError } from "workflow/errors";
import { describe, expect, it } from "vitest";

import {
	createWorkflowSdkRunGateway,
	type WorkflowRunSdk,
} from "../../src/trigger/real-workflow-run-gateway.ts";
import { helloWorkflowId } from "../../workflows/hello.ts";

interface InMemorySdkState {
	readonly nextRunId?: string;
	readonly startError?: Error;
	readonly statuses?: Readonly<Record<string, string>>;
	readonly statusError?: Error;
}

class InMemoryWorkflowRunSdk implements WorkflowRunSdk {
	readonly #state: InMemorySdkState;
	readonly startCalls: Array<{ workflowId: string; args: readonly unknown[] }> = [];

	constructor(state: InMemorySdkState = {}) {
		this.#state = { ...state, statuses: { ...state.statuses } };
	}

	async start(
		workflow: { readonly workflowId: string },
		args: readonly unknown[],
	): Promise<{ readonly runId: string }> {
		this.startCalls.push({ workflowId: workflow.workflowId, args: [...args] });
		if (this.#state.startError !== undefined) throw this.#state.startError;
		return { runId: this.#state.nextRunId ?? "wrun_fixture" };
	}

	getRun(runId: string): { readonly status: Promise<string> } {
		if (this.#state.statusError !== undefined) {
			return { status: Promise.reject(this.#state.statusError) };
		}
		const status = this.#state.statuses?.[runId];
		if (status === undefined) {
			return { status: Promise.reject(new WorkflowRunNotFoundError(runId)) };
		}
		return { status: Promise.resolve(status) };
	}
}

describe("createWorkflowSdkRunGateway", () => {
	it("starts the hello workflow by explicit manifest-derived metadata id", async () => {
		const sdk = new InMemoryWorkflowRunSdk({ nextRunId: "wrun_123" });
		const gateway = createWorkflowSdkRunGateway(sdk);

		const result = await gateway.startHelloWorkflow({ name: "world" });

		expect(result).toEqual({ ok: true, value: { runId: "wrun_123" } });
		expect(sdk.startCalls).toEqual([{ workflowId: helloWorkflowId, args: ["world"] }]);
	});

	it("normalizes an empty vendor run id to a safe failure", async () => {
		const gateway = createWorkflowSdkRunGateway(new InMemoryWorkflowRunSdk({ nextRunId: "" }));

		expect(await gateway.startHelloWorkflow({ name: "world" })).toEqual({ ok: false });
	});

	it("normalizes a start throw to a safe failure", async () => {
		const gateway = createWorkflowSdkRunGateway(
			new InMemoryWorkflowRunSdk({ startError: new Error("queue unavailable") }),
		);

		expect(await gateway.startHelloWorkflow({ name: "world" })).toEqual({ ok: false });
	});

	it("reads a known run status", async () => {
		const gateway = createWorkflowSdkRunGateway(
			new InMemoryWorkflowRunSdk({ statuses: { wrun_123: "running" } }),
		);

		expect(await gateway.readWorkflowRunStatus({ runId: "wrun_123" })).toEqual({
			type: "found",
			value: { status: "running" },
		});
	});

	it("classifies WorkflowRunNotFoundError as a missing run", async () => {
		const gateway = createWorkflowSdkRunGateway(new InMemoryWorkflowRunSdk());

		expect(await gateway.readWorkflowRunStatus({ runId: "wrun_missing" })).toEqual({
			type: "missing",
		});
	});

	it("treats an unrecognized vendor status as an error rather than passing it through", async () => {
		const gateway = createWorkflowSdkRunGateway(
			new InMemoryWorkflowRunSdk({ statuses: { wrun_123: "paused" } }),
		);

		expect(await gateway.readWorkflowRunStatus({ runId: "wrun_123" })).toEqual({ type: "error" });
	});

	it("normalizes any other status read failure to an error", async () => {
		const gateway = createWorkflowSdkRunGateway(
			new InMemoryWorkflowRunSdk({ statusError: new Error("network down") }),
		);

		expect(await gateway.readWorkflowRunStatus({ runId: "wrun_123" })).toEqual({ type: "error" });
	});
});
