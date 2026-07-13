import { describe, expect, it } from "vitest";

import { createRunStatusGetHandler } from "../../api/runs.ts";
import type {
	VercelOidcGateway,
	VercelOidcVerificationResult,
} from "../../src/mint/development-oidc.ts";
import type { WorkflowRunStatus } from "../../src/trigger/contracts.ts";
import type { TriggerEnvironment } from "../../src/trigger/runtime-config.ts";
import type {
	ReadWorkflowRunStatusResult,
	StartWorkflowRunResult,
	WorkflowRunGateway,
} from "../../src/trigger/workflow-run-gateway.ts";

class InMemoryOidcGateway implements VercelOidcGateway {
	readonly #result: VercelOidcVerificationResult;

	constructor(result: VercelOidcVerificationResult) {
		this.#result = result;
	}

	async verifyDevelopmentIdentity(): Promise<VercelOidcVerificationResult> {
		return this.#result;
	}
}

class InMemoryRunStatusGateway implements WorkflowRunGateway {
	readonly #runs: Readonly<Record<string, WorkflowRunStatus>>;
	readonly statusCalls: Array<{ runId: string }> = [];

	constructor(runs: Readonly<Record<string, WorkflowRunStatus>>) {
		this.#runs = { ...runs };
	}

	async startWorkflow(): Promise<StartWorkflowRunResult> {
		return { ok: false };
	}

	async readWorkflowRunStatus(options: {
		readonly runId: string;
	}): Promise<ReadWorkflowRunStatusResult> {
		this.statusCalls.push({ ...options });
		const status = this.#runs[options.runId];
		if (status === undefined) return { type: "missing" };
		return { type: "found", value: { status } };
	}
}

function validEnvironment(): TriggerEnvironment {
	return {
		NS_DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
		NS_DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
		NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
	};
}

function validOidcGateway(): InMemoryOidcGateway {
	return new InMemoryOidcGateway({
		ok: true,
		value: {
			ownerId: "team_dispatch",
			projectId: "prj_dispatch",
			environment: "development",
		},
	});
}

describe("createRunStatusGetHandler", () => {
	it("returns the run status for an authenticated caller with cache prevention", async () => {
		const workflowRuns = new InMemoryRunStatusGateway({ wrun_123: "completed" });
		const handler = createRunStatusGetHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});

		const response = await handler(
			new Request("https://dispatch.example/api/runs?runId=wrun_123", {
				headers: { "x-ns-dispatch-oidc-token": "oidc-token" },
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ runId: "wrun_123", status: "completed" });
		expect(workflowRuns.statusCalls).toEqual([{ runId: "wrun_123" }]);
	});

	it("returns a safe 400 when the runId query parameter is missing", async () => {
		const handler = createRunStatusGetHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => new InMemoryRunStatusGateway({}),
		});

		const response = await handler(
			new Request("https://dispatch.example/api/runs", {
				headers: { "x-ns-dispatch-oidc-token": "oidc-token" },
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: { code: "invalid-request", message: "Invalid run-status request." },
		});
	});

	it("returns a safe 401 without the dispatch-owned caller header", async () => {
		const workflowRuns = new InMemoryRunStatusGateway({ wrun_123: "running" });
		const handler = createRunStatusGetHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => workflowRuns,
		});

		const response = await handler(new Request("https://dispatch.example/api/runs?runId=wrun_123"));

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			error: { code: "unauthorized", message: "Authentication failed." },
		});
		expect(workflowRuns.statusCalls).toEqual([]);
	});

	it("returns 404 for an unknown run", async () => {
		const handler = createRunStatusGetHandler({
			environment: validEnvironment(),
			createOidcGateway: () => validOidcGateway(),
			createWorkflowRunGateway: () => new InMemoryRunStatusGateway({}),
		});

		const response = await handler(
			new Request("https://dispatch.example/api/runs?runId=wrun_missing", {
				headers: { "x-ns-dispatch-oidc-token": "oidc-token" },
			}),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			error: { code: "run-not-found", message: "Run not found." },
		});
	});

	it("returns a variable-name-only no-store 500 for invalid runtime configuration", async () => {
		const environment = {
			...validEnvironment(),
			NS_DISPATCH_VERCEL_TEAM_ID: "team-value-must-not-leak",
		};
		const handler = createRunStatusGetHandler({ environment });

		const response = await handler(new Request("https://dispatch.example/api/runs?runId=wrun_123"));
		const body = await response.text();

		expect(response.status).toBe(500);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toContain("NS_DISPATCH_VERCEL_TEAM_ID");
		expect(body).not.toContain("team-value-must-not-leak");
	});
});
