import { WorkflowRunNotFoundError } from "workflow/errors";
import { describe, expect, it } from "vitest";

import {
	createWorkflowSdkRunGateway,
	type WorkflowRunSdk,
	type WorkflowRunStartOptions,
} from "../../src/trigger/real-workflow-run-gateway.ts";
import { triggerWorkflowIds } from "../../src/trigger/workflow-ids.ts";

const mixedCaseRevision = "0123456789abcdef0123456789ABCDEF01234567";

interface InMemorySdkState {
	readonly nextRunId?: string;
	readonly startError?: Error;
	readonly statuses?: Readonly<Record<string, string>>;
	readonly statusError?: Error;
}

class InMemoryWorkflowRunSdk implements WorkflowRunSdk {
	readonly #state: InMemorySdkState;
	readonly startCalls: Array<{
		workflowId: string;
		args: readonly unknown[];
		options?: WorkflowRunStartOptions;
	}> = [];

	constructor(state: InMemorySdkState = {}) {
		this.#state = { ...state, statuses: { ...state.statuses } };
	}

	async start(
		workflow: { readonly workflowId: string },
		args: readonly unknown[],
		options?: WorkflowRunStartOptions,
	): Promise<{ readonly runId: string }> {
		this.startCalls.push({
			workflowId: workflow.workflowId,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
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

		const result = await gateway.startWorkflow({ workflow: "hello", input: { name: "world" } });

		expect(result).toEqual({ ok: true, value: { runId: "wrun_123" } });
		expect(sdk.startCalls).toEqual([{ workflowId: triggerWorkflowIds.hello, args: ["world"] }]);
	});

	it("starts the sandbox-probe workflow by explicit manifest-derived metadata id", async () => {
		const sdk = new InMemoryWorkflowRunSdk({ nextRunId: "wrun_probe" });
		const gateway = createWorkflowSdkRunGateway(sdk);

		const result = await gateway.startWorkflow({
			workflow: "sandbox-probe",
			input: { revision: mixedCaseRevision },
		});

		expect(result).toEqual({ ok: true, value: { runId: "wrun_probe" } });
		expect(sdk.startCalls).toEqual([
			{ workflowId: triggerWorkflowIds["sandbox-probe"], args: [mixedCaseRevision] },
		]);
	});

	it("starts the supervision-probe workflow with a single serializable params argument", async () => {
		const sdk = new InMemoryWorkflowRunSdk({ nextRunId: "wrun_supervision" });
		const gateway = createWorkflowSdkRunGateway(sdk);

		const result = await gateway.startWorkflow({
			workflow: "supervision-probe",
			input: { runSeconds: 840, pollSeconds: 30 },
		});

		expect(result).toEqual({ ok: true, value: { runId: "wrun_supervision" } });
		expect(sdk.startCalls).toEqual([
			{
				workflowId: triggerWorkflowIds["supervision-probe"],
				args: [{ runSeconds: 840, pollSeconds: 30 }],
			},
		]);
	});

	it.each([
		["prompt", "wrun_prompt", 421],
		["plan", "wrun_plan", 422],
	] as const)(
		"starts %s dispatch with the same locator-only Workflow argument",
		async (_kind, runId, prNumber) => {
			const sdk = new InMemoryWorkflowRunSdk({ nextRunId: runId });
			const gateway = createWorkflowSdkRunGateway(sdk);
			const dispatchId = "dsp_01JABCDEF0123456789";
			const anchorBranch = "dispatch/add-cache-a1b2c3";
			const snapshotRef = "refs/brmem/ns/dispatch-context/dispatch---add-cache-a1b2c3";
			const input = {
				revision: mixedCaseRevision,
				anchorBranch,
				anchorPrNumber: prNumber,
				dispatchId,
				instructionLocator: {
					namespace: "dispatch-context" as const,
					dispatchId,
					key: `${dispatchId}/instructions.md`,
					sourceBranch: anchorBranch,
					snapshotRef,
					snapshotCommitSha: "abcdef0123456789abcdef0123456789abcdef01",
					entryLocator: `${snapshotRef}:${dispatchId}/instructions.md`,
				},
			};

			const result = await gateway.startWorkflow({ workflow: "dispatch", input });

			expect(result).toEqual({ ok: true, value: { runId } });
			expect(sdk.startCalls).toEqual([
				{
					workflowId: triggerWorkflowIds.dispatch,
					args: [input],
					options: {
						attributes: {
							"dispatch.anchor_pr": String(prNumber),
							"dispatch.phase": "queued",
							"dispatch.id": dispatchId,
						},
					},
				},
			]);
			expect(JSON.stringify(sdk.startCalls)).not.toContain("Implement the cache plan");
			expect(JSON.stringify(sdk.startCalls)).not.toContain("Rename the widget gateway methods");
		},
	);

	it("normalizes an empty vendor run id to a safe failure", async () => {
		const gateway = createWorkflowSdkRunGateway(new InMemoryWorkflowRunSdk({ nextRunId: "" }));

		expect(await gateway.startWorkflow({ workflow: "hello", input: { name: "world" } })).toEqual({
			ok: false,
		});
	});

	it("normalizes a start throw to a safe failure", async () => {
		const gateway = createWorkflowSdkRunGateway(
			new InMemoryWorkflowRunSdk({ startError: new Error("queue unavailable") }),
		);

		expect(await gateway.startWorkflow({ workflow: "hello", input: { name: "world" } })).toEqual({
			ok: false,
		});
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
