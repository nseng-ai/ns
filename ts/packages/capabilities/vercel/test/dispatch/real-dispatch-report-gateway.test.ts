import { describe, expect, it } from "vitest";

import {
	buildDecisionLogSection,
	buildDispatchFailureMarker,
	composeAnchorPrDescription,
} from "../../src/dispatch/anchor-pr-report.ts";
import { createGitHubDispatchReportGateway } from "../../src/dispatch/real-dispatch-report-gateway.ts";
import type { DispatchTokenMinter, DispatchTokenMintResult } from "../../src/mint/mint-core.ts";

class RecordingMinter implements DispatchTokenMinter {
	readonly calls: Array<{ repository: string; purpose: string }> = [];
	readonly #fails: boolean;

	constructor(options: { readonly fails?: boolean } = {}) {
		this.#fails = options.fails ?? false;
	}

	async mintDispatchToken(options: {
		readonly repository: string;
		readonly purpose: "clone" | "landing";
	}): Promise<DispatchTokenMintResult> {
		this.calls.push({ ...options });
		if (this.#fails) return { ok: false, error: { code: "github-token-mint-failed" } };
		return {
			ok: true,
			value: {
				token: "report-token-fixture",
				expiresAt: "2026-07-13T00:00:00Z",
				repository: options.repository,
				purpose: options.purpose,
			},
		};
	}
}

interface RecordedRequest {
	readonly url: string;
	readonly method: string;
	readonly authorization: string | null;
	readonly body: unknown;
}

interface FakeGitHubState {
	prBody?: string | null;
	commentBodies?: string[];
	failStatus?: number;
}

function createFakeGitHub(state: FakeGitHubState = {}): {
	readonly fetchImpl: typeof fetch;
	readonly requests: RecordedRequest[];
} {
	const requests: RecordedRequest[] = [];
	const fetchImpl = (async (
		input: Parameters<typeof fetch>[0],
		init?: Parameters<typeof fetch>[1],
	) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const headers = new Headers(init?.headers);
		requests.push({
			url,
			method,
			authorization: headers.get("authorization"),
			body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
		});
		if (state.failStatus !== undefined) {
			return new Response("{}", { status: state.failStatus });
		}
		if (method === "GET" && /\/pulls\/\d+$/.test(url)) {
			return Response.json({ body: state.prBody ?? null });
		}
		if (method === "PATCH" && /\/pulls\/\d+$/.test(url)) {
			return Response.json({ body: "updated" });
		}
		if (method === "GET" && url.includes("/comments")) {
			return Response.json((state.commentBodies ?? []).map((body) => ({ body })));
		}
		if (method === "POST" && url.includes("/comments")) {
			return Response.json({ id: 1 }, { status: 201 });
		}
		return new Response("{}", { status: 404 });
	}) as typeof fetch;
	return { fetchImpl, requests };
}

describe("createGitHubDispatchReportGateway", () => {
	it("publishes the decision log by composing the marked section into the PR description", async () => {
		const minter = new RecordingMinter();
		const github = createFakeGitHub({ prBody: "Dispatched from my-branch." });
		const gateway = createGitHubDispatchReportGateway({
			repository: "nseng-ai/ns",
			minter,
			fetchImpl: github.fetchImpl,
		});

		const result = await gateway.publishAnchorPrDecisionLog({
			anchorPrNumber: 421,
			decisionLog: "- Chose A.",
		});

		expect(result).toEqual({ ok: true });
		expect(minter.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "landing" }]);
		expect(github.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
			"GET https://api.github.com/repos/nseng-ai/ns/pulls/421",
			"PATCH https://api.github.com/repos/nseng-ai/ns/pulls/421",
		]);
		expect(github.requests[1]?.body).toEqual({
			body: composeAnchorPrDescription(
				"Dispatched from my-branch.",
				buildDecisionLogSection("- Chose A."),
			),
		});
		expect(github.requests[0]?.authorization).toBe("Bearer report-token-fixture");
	});

	it("skips the PATCH when the description already carries the same section", async () => {
		const section = buildDecisionLogSection("- Chose A.");
		const existing = composeAnchorPrDescription("Intro.", section);
		const github = createFakeGitHub({ prBody: existing });
		const gateway = createGitHubDispatchReportGateway({
			repository: "nseng-ai/ns",
			minter: new RecordingMinter(),
			fetchImpl: github.fetchImpl,
		});

		const result = await gateway.publishAnchorPrDecisionLog({
			anchorPrNumber: 421,
			decisionLog: "- Chose A.",
		});

		expect(result).toEqual({ ok: true });
		expect(github.requests.map((request) => request.method)).toEqual(["GET"]);
	});

	it("fails safe when the token mint fails, without calling GitHub", async () => {
		const github = createFakeGitHub();
		const gateway = createGitHubDispatchReportGateway({
			repository: "nseng-ai/ns",
			minter: new RecordingMinter({ fails: true }),
			fetchImpl: github.fetchImpl,
		});

		expect(
			await gateway.publishAnchorPrDecisionLog({ anchorPrNumber: 421, decisionLog: null }),
		).toEqual({ ok: false });
		expect(github.requests).toEqual([]);
	});

	it("fails safe on a GitHub error status", async () => {
		const github = createFakeGitHub({ failStatus: 502 });
		const gateway = createGitHubDispatchReportGateway({
			repository: "nseng-ai/ns",
			minter: new RecordingMinter(),
			fetchImpl: github.fetchImpl,
		});

		expect(
			await gateway.publishAnchorPrDecisionLog({ anchorPrNumber: 421, decisionLog: "x" }),
		).toEqual({ ok: false });
	});

	it("posts the marked failure comment once", async () => {
		const github = createFakeGitHub({ commentBodies: ["unrelated comment"] });
		const gateway = createGitHubDispatchReportGateway({
			repository: "nseng-ai/ns",
			minter: new RecordingMinter(),
			fetchImpl: github.fetchImpl,
		});

		const result = await gateway.ensureAnchorPrFailureComment({
			anchorPrNumber: 421,
			anchorBranch: "dispatch/widget",
			code: "harness-failed",
			message: "The dispatched harness run reported failure.",
		});

		expect(result).toEqual({ ok: true });
		expect(github.requests.map((request) => `${request.method}`)).toEqual(["GET", "POST"]);
		const posted = github.requests[1]?.body as { body: string };
		expect(posted.body).toContain(buildDispatchFailureMarker("dispatch/widget"));
		expect(posted.body).toContain("harness-failed");
	});

	it("does not post a second failure comment when the marker is already present", async () => {
		const marker = buildDispatchFailureMarker("dispatch/widget");
		const github = createFakeGitHub({ commentBodies: [`${marker}\nDispatch failed earlier.`] });
		const gateway = createGitHubDispatchReportGateway({
			repository: "nseng-ai/ns",
			minter: new RecordingMinter(),
			fetchImpl: github.fetchImpl,
		});

		const result = await gateway.ensureAnchorPrFailureComment({
			anchorPrNumber: 421,
			anchorBranch: "dispatch/widget",
			code: "harness-failed",
			message: "The dispatched harness run reported failure.",
		});

		expect(result).toEqual({ ok: true });
		expect(github.requests.map((request) => request.method)).toEqual(["GET"]);
	});
});
