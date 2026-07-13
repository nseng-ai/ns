import { describe, expect, it } from "vitest";

import type {
	VercelOidcGateway,
	VercelOidcVerificationResult,
} from "../../src/mint/development-oidc.ts";
import type { WorkflowRunStatus } from "../../src/trigger/contracts.ts";
import {
	handleRunStatusRequest,
	handleTriggerRequest,
	type TriggerRequestContext,
} from "../../src/trigger/handle-trigger-request.ts";
import type { TriggerRuntimeConfig } from "../../src/trigger/runtime-config.ts";
import type {
	ReadWorkflowRunStatusResult,
	StartWorkflowRunResult,
	WorkflowRunGateway,
} from "../../src/trigger/workflow-run-gateway.ts";

const config: TriggerRuntimeConfig = {
	vercelTeamId: "team_dispatch",
	vercelProjectId: "prj_dispatch",
	vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
	vercelOidcAudience: "https://vercel.com/nseng-ai",
};

class InMemoryVercelOidcGateway implements VercelOidcGateway {
	readonly #result: VercelOidcVerificationResult;
	readonly calls: Array<{ token: string; issuer: string; audience: string }> = [];

	constructor(result: VercelOidcVerificationResult) {
		this.#result = result;
	}

	async verifyDevelopmentIdentity(options: {
		readonly token: string;
		readonly issuer: string;
		readonly audience: string;
	}): Promise<VercelOidcVerificationResult> {
		this.calls.push({ ...options });
		return this.#result;
	}
}

interface InMemoryWorkflowRunsState {
	readonly startFails?: boolean;
	readonly statusReadFails?: boolean;
	readonly nextRunId?: string;
	readonly runs?: Readonly<Record<string, WorkflowRunStatus>>;
}

class InMemoryWorkflowRunGateway implements WorkflowRunGateway {
	readonly #state: InMemoryWorkflowRunsState;
	readonly startCalls: Array<{ name: string }> = [];
	readonly statusCalls: Array<{ runId: string }> = [];

	constructor(state: InMemoryWorkflowRunsState = {}) {
		this.#state = { ...state, runs: { ...state.runs } };
	}

	async startHelloWorkflow(options: { readonly name: string }): Promise<StartWorkflowRunResult> {
		this.startCalls.push({ ...options });
		if (this.#state.startFails === true) return { ok: false };
		return { ok: true, value: { runId: this.#state.nextRunId ?? "wrun_fixture" } };
	}

	async readWorkflowRunStatus(options: {
		readonly runId: string;
	}): Promise<ReadWorkflowRunStatusResult> {
		this.statusCalls.push({ ...options });
		if (this.#state.statusReadFails === true) return { type: "error" };
		const status = this.#state.runs?.[options.runId];
		if (status === undefined) return { type: "missing" };
		return { type: "found", value: { status } };
	}
}

function developmentIdentity(): VercelOidcVerificationResult {
	return {
		ok: true,
		value: {
			ownerId: "team_dispatch",
			projectId: "prj_dispatch",
			environment: "development",
		},
	};
}

function context(options: {
	readonly oidcResult?: VercelOidcVerificationResult;
	readonly workflowRuns?: InMemoryWorkflowRunGateway;
}): TriggerRequestContext {
	return {
		config,
		oidc: new InMemoryVercelOidcGateway(options.oidcResult ?? developmentIdentity()),
		workflowRuns: options.workflowRuns ?? new InMemoryWorkflowRunGateway(),
	};
}

describe("handleTriggerRequest", () => {
	it("starts the hello workflow for an authenticated Development caller", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway({ nextRunId: "wrun_123" });

		const response = await handleTriggerRequest(
			{ body: { workflow: "hello", name: "world" }, oidcToken: "oidc-token" },
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 200,
			body: { runId: "wrun_123", workflow: "hello" },
		});
		expect(workflowRuns.startCalls).toEqual([{ name: "world" }]);
	});

	it.each([
		["unknown workflow", { workflow: "dispatch", name: "world" }],
		["missing name", { workflow: "hello" }],
		["empty name", { workflow: "hello", name: "" }],
		["extra key", { workflow: "hello", name: "world", extra: true }],
	])("rejects a request with %s before starting anything", async (_label, body) => {
		const workflowRuns = new InMemoryWorkflowRunGateway();

		const response = await handleTriggerRequest(
			{ body, oidcToken: "oidc-token" },
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 400,
			body: { error: { code: "invalid-request", message: "Invalid trigger request." } },
		});
		expect(workflowRuns.startCalls).toEqual([]);
	});

	it("returns a safe 401 without a caller token", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway();

		const response = await handleTriggerRequest(
			{ body: { workflow: "hello", name: "world" }, oidcToken: null },
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 401,
			body: { error: { code: "unauthorized", message: "Authentication failed." } },
		});
		expect(workflowRuns.startCalls).toEqual([]);
	});

	it("returns 401 when token verification fails", async () => {
		const response = await handleTriggerRequest(
			{ body: { workflow: "hello", name: "world" }, oidcToken: "bad-token" },
			context({ oidcResult: { ok: false } }),
		);

		expect(response.status).toBe(401);
	});

	it.each([
		["team", { ownerId: "team_other", projectId: "prj_dispatch", environment: "development" }],
		["project", { ownerId: "team_dispatch", projectId: "prj_other", environment: "development" }],
		[
			"environment",
			{ ownerId: "team_dispatch", projectId: "prj_dispatch", environment: "production" },
		],
	])("returns 403 for a verified token with the wrong %s", async (_label, value) => {
		const workflowRuns = new InMemoryWorkflowRunGateway();

		const response = await handleTriggerRequest(
			{ body: { workflow: "hello", name: "world" }, oidcToken: "oidc-token" },
			context({ oidcResult: { ok: true, value }, workflowRuns }),
		);

		expect(response).toEqual({
			status: 403,
			body: { error: { code: "forbidden", message: "Trigger request is not authorized." } },
		});
		expect(workflowRuns.startCalls).toEqual([]);
	});

	it("maps a workflow start failure to a stable 502", async () => {
		const response = await handleTriggerRequest(
			{ body: { workflow: "hello", name: "world" }, oidcToken: "oidc-token" },
			context({ workflowRuns: new InMemoryWorkflowRunGateway({ startFails: true }) }),
		);

		expect(response).toEqual({
			status: 502,
			body: { error: { code: "workflow-start-failed", message: "Workflow start failed." } },
		});
	});
});

describe("handleRunStatusRequest", () => {
	it("returns the status of an existing run", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway({ runs: { wrun_123: "running" } });

		const response = await handleRunStatusRequest(
			{ runId: "wrun_123", oidcToken: "oidc-token" },
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 200,
			body: { runId: "wrun_123", status: "running" },
		});
		expect(workflowRuns.statusCalls).toEqual([{ runId: "wrun_123" }]);
	});

	it.each([
		["null", null],
		["empty", ""],
	])("rejects a %s run id before authenticating", async (_label, runId) => {
		const oidc = new InMemoryVercelOidcGateway(developmentIdentity());

		const response = await handleRunStatusRequest(
			{ runId, oidcToken: "oidc-token" },
			{ config, oidc, workflowRuns: new InMemoryWorkflowRunGateway() },
		);

		expect(response).toEqual({
			status: 400,
			body: { error: { code: "invalid-request", message: "Invalid run-status request." } },
		});
	});

	it("returns a safe 401 without a caller token", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway({ runs: { wrun_123: "running" } });

		const response = await handleRunStatusRequest(
			{ runId: "wrun_123", oidcToken: null },
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 401,
			body: { error: { code: "unauthorized", message: "Authentication failed." } },
		});
		expect(workflowRuns.statusCalls).toEqual([]);
	});

	it("returns 404 for an unknown run", async () => {
		const response = await handleRunStatusRequest(
			{ runId: "wrun_missing", oidcToken: "oidc-token" },
			context({ workflowRuns: new InMemoryWorkflowRunGateway() }),
		);

		expect(response).toEqual({
			status: 404,
			body: { error: { code: "run-not-found", message: "Run not found." } },
		});
	});

	it("maps a status read failure to a stable 502", async () => {
		const response = await handleRunStatusRequest(
			{ runId: "wrun_123", oidcToken: "oidc-token" },
			context({ workflowRuns: new InMemoryWorkflowRunGateway({ statusReadFails: true }) }),
		);

		expect(response).toEqual({
			status: 502,
			body: { error: { code: "run-status-read-failed", message: "Run status read failed." } },
		});
	});
});
