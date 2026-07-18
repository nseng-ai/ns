import { describe, expect, test } from "vitest";

import { DISPATCH_OIDC_HEADER_NAME } from "../../src/http/wire.ts";
import { createRealDispatchTriggerGateway } from "../../src/dispatch-client/real-trigger-gateway.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const TRIGGER_CONNECTION = {
	deploymentUrl: "https://ns-dispatch.example.vercel.app",
	oidcToken: "fake-token",
	protectionBypass: "fake-protection-bypass",
};
const SHORT_TRIGGER_CONNECTION = { deploymentUrl: "https://x.test", oidcToken: "t" };

function dispatchInput(anchorBranch = "dispatch/feature-ab12cd34") {
	const dispatchId = "dsp_01JABCDEF0123456789";
	const snapshotRef = `refs/brmem/ns/dispatch-context/${anchorBranch.replaceAll("/", "---")}`;
	return {
		revision: SHA,
		anchorBranch,
		anchorPrNumber: 612,
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
}

interface RecordedFetch {
	url: string;
	method: string | undefined;
	headers: Record<string, string>;
	body: unknown;
}

function fakeFetch(respond: (recorded: RecordedFetch) => Response) {
	const requests: RecordedFetch[] = [];
	const fetchFn: typeof fetch = async (input, init) => {
		const recorded: RecordedFetch = {
			url: String(input),
			method: init?.method,
			headers: Object.fromEntries(new Headers(init?.headers).entries()),
			body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
		};
		requests.push(recorded);
		return respond(recorded);
	};
	return { fetchFn, requests };
}

describe("real trigger gateway", () => {
	test("treats 404 run-not-found as an authorized identity preflight", async () => {
		const { fetchFn, requests } = fakeFetch(() =>
			Response.json(
				{ error: { code: "run-not-found", message: "Run not found." } },
				{ status: 404 },
			),
		);
		const gateway = createRealDispatchTriggerGateway(fetchFn);
		const result = await gateway.checkTriggerIdentity({ connection: TRIGGER_CONNECTION });

		expect(result).toEqual({ type: "authorized" });
		expect(requests[0]?.url).toBe(
			"https://ns-dispatch.example.vercel.app/api/runs?runId=wrun_00000000000000000000000000",
		);
		expect(requests[0]?.headers[DISPATCH_OIDC_HEADER_NAME]).toBe("fake-token");
		expect(requests[0]?.headers["x-vercel-protection-bypass"]).toBe("fake-protection-bypass");
	});

	test("maps identity statuses and network failures", async () => {
		const unauthorized = createRealDispatchTriggerGateway(
			fakeFetch(() => Response.json({ error: {} }, { status: 401 })).fetchFn,
		);
		expect(
			await unauthorized.checkTriggerIdentity({ connection: SHORT_TRIGGER_CONNECTION }),
		).toEqual({ type: "unauthorized" });

		const failingFetch: typeof fetch = async () => {
			throw new Error("connect ECONNREFUSED");
		};
		const failing = createRealDispatchTriggerGateway(failingFetch);
		const result = await failing.checkTriggerIdentity({
			connection: SHORT_TRIGGER_CONNECTION,
		});
		expect(result.type).toBe("unreachable");
	});

	test("starts the dispatch workflow and returns the run id", async () => {
		const { fetchFn, requests } = fakeFetch(() =>
			Response.json({ runId: "wf-run-9", workflow: "dispatch" }, { status: 200 }),
		);
		const gateway = createRealDispatchTriggerGateway(fetchFn);
		const result = await gateway.startDispatchRun({
			connection: TRIGGER_CONNECTION,
			input: dispatchInput(),
		});

		expect(result).toEqual({ ok: true, value: { runId: "wf-run-9" } });
		expect(requests[0]?.url).toBe("https://ns-dispatch.example.vercel.app/api/trigger");
		expect(requests[0]?.method).toBe("POST");
		expect(requests[0]?.body).toEqual({ workflow: "dispatch", ...dispatchInput() });
		expect(JSON.stringify(requests[0]?.body)).not.toContain("Do a thing");
		expect(requests[0]?.headers[DISPATCH_OIDC_HEADER_NAME]).toBe("fake-token");
		expect(requests[0]?.headers["x-vercel-protection-bypass"]).toBe("fake-protection-bypass");
	});

	test("maps trigger refusals to stable codes with the remote reason", async () => {
		const { fetchFn } = fakeFetch(() =>
			Response.json(
				{ error: { code: "workflow-start-failed", message: "Workflow start failed." } },
				{ status: 502 },
			),
		);
		const gateway = createRealDispatchTriggerGateway(fetchFn);
		const result = await gateway.startDispatchRun({
			connection: SHORT_TRIGGER_CONNECTION,
			input: { ...dispatchInput("dispatch/a-b"), anchorPrNumber: 1 },
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("workflow-start-failed");
			expect(result.error.message).toContain("Workflow start failed.");
		}
	});

	test("treats a 200 without a run id as an unexpected response", async () => {
		const { fetchFn } = fakeFetch(() => Response.json({}, { status: 200 }));
		const gateway = createRealDispatchTriggerGateway(fetchFn);
		const result = await gateway.startDispatchRun({
			connection: SHORT_TRIGGER_CONNECTION,
			input: { ...dispatchInput("dispatch/a-b"), anchorPrNumber: 1 },
		});

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("unexpected-response");
	});
});
