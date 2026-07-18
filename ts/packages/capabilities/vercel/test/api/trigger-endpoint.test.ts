import { describe, expect, it } from "vitest";

import { createTriggerPostHandler } from "../../api/trigger.ts";
import type { TriggerEnvironment } from "../../src/trigger/runtime-config.ts";
import type {
	ReadWorkflowRunStatusResult,
	StartWorkflowRunResult,
	WorkflowRunGateway,
	WorkflowStartRequest,
} from "../../src/trigger/workflow-run-gateway.ts";
import {
	DEVELOPMENT_OIDC_TRUST_ENVIRONMENT,
	InMemoryVercelOidcGateway,
} from "../support/route-fakes.ts";

class RecordingWorkflowRunGateway implements WorkflowRunGateway {
	readonly #runId: string;
	readonly startCalls: WorkflowStartRequest[] = [];

	constructor(runId: string) {
		this.#runId = runId;
	}

	async startWorkflow(request: WorkflowStartRequest): Promise<StartWorkflowRunResult> {
		this.startCalls.push(request);
		return { ok: true, value: { runId: this.#runId } };
	}

	async readWorkflowRunStatus(): Promise<ReadWorkflowRunStatusResult> {
		return { type: "missing" };
	}
}

function validEnvironment(): TriggerEnvironment {
	return { ...DEVELOPMENT_OIDC_TRUST_ENVIRONMENT };
}

function validOidcGateway(): InMemoryVercelOidcGateway {
	return new InMemoryVercelOidcGateway();
}

describe("createTriggerPostHandler", () => {
	it("starts the hello workflow and returns the run id with cache prevention", async () => {
		const workflowRuns = new RecordingWorkflowRunGateway("wrun_123");
		const handler = createTriggerPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});

		const response = await handler(
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-ns-dispatch-oidc-token": "oidc-token",
				},
				body: JSON.stringify({ workflow: "hello", name: "world" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.text()).toBe('{"runId":"wrun_123","workflow":"hello"}');
		expect(workflowRuns.startCalls).toEqual([{ workflow: "hello", input: { name: "world" } }]);
	});

	it("starts the sandbox-probe workflow through the same authenticated route", async () => {
		const workflowRuns = new RecordingWorkflowRunGateway("wrun_probe");
		const handler = createTriggerPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});
		const revision = "0123456789abcdef0123456789ABCDEF01234567";

		const response = await handler(
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-ns-dispatch-oidc-token": "oidc-token",
				},
				body: JSON.stringify({ workflow: "sandbox-probe", revision }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ runId: "wrun_probe", workflow: "sandbox-probe" });
		expect(workflowRuns.startCalls).toEqual([{ workflow: "sandbox-probe", input: { revision } }]);
	});

	it("starts the supervision-probe workflow through the same authenticated route", async () => {
		const workflowRuns = new RecordingWorkflowRunGateway("wrun_supervision");
		const handler = createTriggerPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});

		const response = await handler(
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-ns-dispatch-oidc-token": "oidc-token",
				},
				body: JSON.stringify({ workflow: "supervision-probe", runSeconds: 840, pollSeconds: 30 }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			runId: "wrun_supervision",
			workflow: "supervision-probe",
		});
		expect(workflowRuns.startCalls).toEqual([
			{
				workflow: "supervision-probe",
				input: { runSeconds: 840, pollSeconds: 30 },
			},
		]);
	});

	it("starts the dispatch workflow through the same authenticated route", async () => {
		const workflowRuns = new RecordingWorkflowRunGateway("wrun_dispatch");
		const handler = createTriggerPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});
		const revision = "ABCDEF0123456789abcdef0123456789ABCDEF01";
		const dispatchId = "dsp_01JABCDEF0123456789";
		const anchorBranch = "dispatch/widget-refactor-a1b2c3";
		const snapshotRef = "refs/brmem/ns/dispatch-context/dispatch---widget-refactor-a1b2c3";
		const instructionLocator = {
			namespace: "dispatch-context",
			dispatchId,
			key: `${dispatchId}/instructions.md`,
			sourceBranch: anchorBranch,
			snapshotRef,
			snapshotCommitSha: "abcdef0123456789abcdef0123456789abcdef01",
			entryLocator: `${snapshotRef}:${dispatchId}/instructions.md`,
		};

		const response = await handler(
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-ns-dispatch-oidc-token": "oidc-token",
				},
				body: JSON.stringify({
					workflow: "dispatch",
					revision,
					anchorBranch,
					anchorPrNumber: 421,
					dispatchId,
					instructionLocator,
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ runId: "wrun_dispatch", workflow: "dispatch" });
		expect(workflowRuns.startCalls).toEqual([
			{
				workflow: "dispatch",
				input: {
					revision,
					anchorBranch,
					anchorPrNumber: 421,
					dispatchId,
					instructionLocator,
				},
			},
		]);
	});

	it("ignores Vercel's reserved workload-identity header", async () => {
		const workflowRuns = new RecordingWorkflowRunGateway("wrun_123");
		const handler = createTriggerPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});

		const response = await handler(
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-vercel-oidc-token": "production-workload-token",
				},
				body: JSON.stringify({ workflow: "hello", name: "world" }),
			}),
		);

		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.text()).toBe(
			'{"error":{"code":"unauthorized","message":"Authentication failed."}}',
		);
		expect(workflowRuns.startCalls).toEqual([]);
	});

	it("returns a safe no-store 400 for malformed JSON", async () => {
		const handler = createTriggerPostHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => new RecordingWorkflowRunGateway("wrun_123"),
		});

		const response = await handler(
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				headers: { "x-ns-dispatch-oidc-token": "oidc-token" },
				body: "{",
			}),
		);

		expect(response.status).toBe(400);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			error: { code: "invalid-request", message: "Invalid trigger request." },
		});
	});

	it("returns a fresh variable-name-only no-store 500 for every misconfigured request", async () => {
		const environment = {
			...validEnvironment(),
			NS_DISPATCH_VERCEL_OIDC_ISSUER: "issuer-value-must-not-leak",
		};
		const handler = createTriggerPostHandler({ environment });
		const request = () =>
			new Request("https://dispatch.example/api/trigger", {
				method: "POST",
				body: "{}",
			});

		const firstResponse = await handler(request());
		const secondResponse = await handler(request());
		const firstBody = await firstResponse.text();
		const secondBody = await secondResponse.text();

		for (const response of [firstResponse, secondResponse]) {
			expect(response.status).toBe(500);
			expect(response.headers.get("cache-control")).toBe("no-store");
		}
		expect(firstBody).toBe(secondBody);
		expect(firstBody).toContain("NS_DISPATCH_VERCEL_OIDC_ISSUER");
		expect(firstBody).not.toContain("issuer-value-must-not-leak");
	});
});
