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
	WorkflowStartRequest,
} from "../../src/trigger/workflow-run-gateway.ts";

const config: TriggerRuntimeConfig = {
	vercelTeamId: "team_dispatch",
	vercelProjectId: "prj_dispatch",
	vercelOidcIssuer: "https://oidc.vercel.com/nseng-ai",
	vercelOidcAudience: "https://vercel.com/nseng-ai",
};

const probeRevision = "0123456789abcdef0123456789ABCDEF01234567";

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
	readonly shouldStartFail?: boolean;
	readonly shouldStatusReadFail?: boolean;
	readonly nextRunId?: string;
	readonly runs?: Readonly<Record<string, WorkflowRunStatus>>;
}

class InMemoryWorkflowRunGateway implements WorkflowRunGateway {
	readonly #state: InMemoryWorkflowRunsState;
	readonly startCalls: WorkflowStartRequest[] = [];
	readonly statusCalls: Array<{ runId: string }> = [];

	constructor(state: InMemoryWorkflowRunsState = {}) {
		this.#state = { ...state, runs: { ...state.runs } };
	}

	async startWorkflow(request: WorkflowStartRequest): Promise<StartWorkflowRunResult> {
		this.startCalls.push(request);
		if (this.#state.shouldStartFail === true) return { ok: false };
		return { ok: true, value: { runId: this.#state.nextRunId ?? "wrun_fixture" } };
	}

	async readWorkflowRunStatus(options: {
		readonly runId: string;
	}): Promise<ReadWorkflowRunStatusResult> {
		this.statusCalls.push({ ...options });
		if (this.#state.shouldStatusReadFail === true) return { type: "error" };
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
		expect(workflowRuns.startCalls).toEqual([{ workflow: "hello", input: { name: "world" } }]);
	});

	it("starts the sandbox-probe workflow with the requested exact revision", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway({ nextRunId: "wrun_probe" });

		const response = await handleTriggerRequest(
			{ body: { workflow: "sandbox-probe", revision: probeRevision }, oidcToken: "oidc-token" },
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 200,
			body: { runId: "wrun_probe", workflow: "sandbox-probe" },
		});
		expect(workflowRuns.startCalls).toEqual([
			{ workflow: "sandbox-probe", input: { revision: probeRevision } },
		]);
	});

	it("starts the supervision-probe workflow with the validated run length and poll cadence", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway({ nextRunId: "wrun_supervision" });

		const response = await handleTriggerRequest(
			{
				body: { workflow: "supervision-probe", runSeconds: 840, pollSeconds: 30 },
				oidcToken: "oidc-token",
			},
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 200,
			body: { runId: "wrun_supervision", workflow: "supervision-probe" },
		});
		expect(workflowRuns.startCalls).toEqual([
			{
				workflow: "supervision-probe",
				input: { runSeconds: 840, pollSeconds: 30 },
			},
		]);
	});

	it("starts the dispatch workflow with the validated run input", async () => {
		const workflowRuns = new InMemoryWorkflowRunGateway({ nextRunId: "wrun_dispatch" });

		const response = await handleTriggerRequest(
			{
				body: {
					workflow: "dispatch",
					revision: probeRevision,
					anchorBranch: "dispatch/widget-refactor-a1b2c3",
					anchorPrNumber: 421,
					prompt: "Rename the widget gateway methods.",
				},
				oidcToken: "oidc-token",
			},
			context({ workflowRuns }),
		);

		expect(response).toEqual({
			status: 200,
			body: { runId: "wrun_dispatch", workflow: "dispatch" },
		});
		expect(workflowRuns.startCalls).toEqual([
			{
				workflow: "dispatch",
				input: {
					revision: probeRevision,
					anchorBranch: "dispatch/widget-refactor-a1b2c3",
					anchorPrNumber: 421,
					prompt: "Rename the widget gateway methods.",
				},
			},
		]);
	});

	it.each([
		["unknown workflow", { workflow: "nightly", name: "world" }],
		["missing name", { workflow: "hello" }],
		["empty name", { workflow: "hello", name: "" }],
		["extra key", { workflow: "hello", name: "world", extra: true }],
		["missing probe revision", { workflow: "sandbox-probe" }],
		["non-SHA probe revision", { workflow: "sandbox-probe", revision: "main" }],
		["probe request with hello's field", { workflow: "sandbox-probe", name: "world" }],
		[
			"probe request with an extra key",
			{ workflow: "sandbox-probe", revision: probeRevision, extra: true },
		],
		["missing supervision parameters", { workflow: "supervision-probe" }],
		[
			"non-integer supervision run length",
			{ workflow: "supervision-probe", runSeconds: 60.5, pollSeconds: 30 },
		],
		[
			"supervision run length below the minimum",
			{ workflow: "supervision-probe", runSeconds: 9, pollSeconds: 30 },
		],
		[
			"supervision run length above the maximum",
			{ workflow: "supervision-probe", runSeconds: 3601, pollSeconds: 30 },
		],
		[
			"supervision poll cadence below the minimum",
			{ workflow: "supervision-probe", runSeconds: 840, pollSeconds: 4 },
		],
		[
			"supervision poll cadence above the maximum",
			{ workflow: "supervision-probe", runSeconds: 840, pollSeconds: 301 },
		],
		[
			"supervision request with an extra key",
			{ workflow: "supervision-probe", runSeconds: 840, pollSeconds: 30, extra: true },
		],
		[
			"dispatch request missing its anchor",
			{ workflow: "dispatch", revision: probeRevision, prompt: "p" },
		],
		[
			"dispatch anchor branch without the dispatch/ prefix",
			{
				workflow: "dispatch",
				revision: probeRevision,
				anchorBranch: "feature/widget",
				anchorPrNumber: 421,
				prompt: "p",
			},
		],
		[
			"dispatch anchor branch with an unsafe character",
			{
				workflow: "dispatch",
				revision: probeRevision,
				anchorBranch: "dispatch/widget refactor",
				anchorPrNumber: 421,
				prompt: "p",
			},
		],
		[
			"non-integer dispatch anchor PR number",
			{
				workflow: "dispatch",
				revision: probeRevision,
				anchorBranch: "dispatch/widget",
				anchorPrNumber: 4.2,
				prompt: "p",
			},
		],
		[
			"empty dispatch prompt",
			{
				workflow: "dispatch",
				revision: probeRevision,
				anchorBranch: "dispatch/widget",
				anchorPrNumber: 421,
				prompt: "",
			},
		],
		[
			"dispatch request with an extra key",
			{
				workflow: "dispatch",
				revision: probeRevision,
				anchorBranch: "dispatch/widget",
				anchorPrNumber: 421,
				prompt: "p",
				extra: true,
			},
		],
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
			context({ workflowRuns: new InMemoryWorkflowRunGateway({ shouldStartFail: true }) }),
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
			context({ workflowRuns: new InMemoryWorkflowRunGateway({ shouldStatusReadFail: true }) }),
		);

		expect(response).toEqual({
			status: 502,
			body: { error: { code: "run-status-read-failed", message: "Run status read failed." } },
		});
	});
});
