import { describe, expect, test } from "vitest";

import { DISPATCH_OIDC_HEADER_NAME } from "../../src/http/wire.ts";
import { createRealDispatchTriggerGateway } from "../../src/ns/dispatch-prompt/real-trigger-gateway.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const TRIGGER_CONNECTION = {
	deploymentUrl: "https://ns-dispatch.example.vercel.app",
	oidcToken: "fake-token",
};
const SHORT_TRIGGER_CONNECTION = { deploymentUrl: "https://x.test", oidcToken: "t" };

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
			"https://ns-dispatch.example.vercel.app/api/runs?runId=ns-dispatch-identity-preflight",
		);
		expect(requests[0]?.headers[DISPATCH_OIDC_HEADER_NAME]).toBe("fake-token");
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
			input: {
				revision: SHA,
				anchorBranch: "dispatch/feature-ab12cd34",
				anchorPrNumber: 612,
				prompt: "Do a thing",
			},
		});

		expect(result).toEqual({ ok: true, value: { runId: "wf-run-9" } });
		expect(requests[0]?.url).toBe("https://ns-dispatch.example.vercel.app/api/trigger");
		expect(requests[0]?.method).toBe("POST");
		expect(requests[0]?.body).toEqual({
			workflow: "dispatch",
			revision: SHA,
			anchorBranch: "dispatch/feature-ab12cd34",
			anchorPrNumber: 612,
			prompt: "Do a thing",
		});
		expect(requests[0]?.headers[DISPATCH_OIDC_HEADER_NAME]).toBe("fake-token");
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
			input: {
				revision: SHA,
				anchorBranch: "dispatch/a-b",
				anchorPrNumber: 1,
				prompt: "p",
			},
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
			input: { revision: SHA, anchorBranch: "dispatch/a-b", anchorPrNumber: 1, prompt: "p" },
		});

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("unexpected-response");
	});
});
