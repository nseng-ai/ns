// Real-adapter protocol tests for the dispatch-prompt gateways: pure wire
// parsers plus scripted-runner / fake-fetch checks of the exact argv and
// HTTP shapes. No subprocess, network, or file write happens here.
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

import { buildDispatchRunIdStamp } from "../../src/dispatch/run-id-stamp.ts";
import {
	createRealDispatchAnchorPrGateway,
	createRealDispatchLocalTokenGateway,
	createRealDispatchTriggerGateway,
	createRealDispatchWorkspaceGitGateway,
	DISPATCH_OIDC_HEADER_NAME,
	generateRealAnchorId,
	parseEnvFileValue,
	parseGhPrCreateUrl,
	parseGitLsRemoteSha,
	parseGitPorcelainStatusPaths,
} from "../../src/ns/dispatch-prompt/real-gateways.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

function exited(overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {}): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code: 0, signal: null, ...overrides };
}

function scriptedRunner(responses: readonly ExecResult[]) {
	const calls: { command: string; args: readonly string[] }[] = [];
	let index = 0;
	const runner: CommandRunner = async (command, args) => {
		calls.push({ command, args: [...args] });
		const response = responses[index] ?? responses[responses.length - 1];
		index += 1;
		return response ?? exited();
	};
	return { runner, calls };
}

describe("wire parsers", () => {
	test("parses porcelain status paths including renames", () => {
		const paths = parseGitPorcelainStatusPaths(
			" M src/widget.ts\n?? notes.md\nR  old.ts -> new.ts\n",
		);
		expect(paths).toEqual(["src/widget.ts", "notes.md", "old.ts -> new.ts"]);
	});

	test("parses ls-remote output to a lowercase sha or null", () => {
		expect(parseGitLsRemoteSha(`${SHA.toUpperCase()}\trefs/heads/feature\n`)).toBe(SHA);
		expect(parseGitLsRemoteSha("")).toBeNull();
		expect(parseGitLsRemoteSha("not-a-sha\trefs/heads/feature\n")).toBeNull();
	});

	test("parses the PR url printed by gh pr create", () => {
		expect(parseGhPrCreateUrl("Some notice\nhttps://github.com/nseng-ai/ns/pull/612\n")).toEqual({
			number: 612,
			url: "https://github.com/nseng-ai/ns/pull/612",
		});
		expect(parseGhPrCreateUrl("no url here")).toBeNull();
	});

	test("reads one named value from env-file content without touching others", () => {
		const content = 'OTHER="x"\nVERCEL_OIDC_TOKEN="abc.def"\nMORE=y\n';
		expect(parseEnvFileValue(content, "VERCEL_OIDC_TOKEN")).toBe("abc.def");
		expect(parseEnvFileValue("VERCEL_OIDC_TOKEN=raw-value\n", "VERCEL_OIDC_TOKEN")).toBe(
			"raw-value",
		);
		expect(parseEnvFileValue("", "VERCEL_OIDC_TOKEN")).toBeNull();
	});

	test("generates eight-hex anchor ids", () => {
		expect(generateRealAnchorId()).toMatch(/^[0-9a-f]{8}$/);
	});
});

describe("real workspace git gateway", () => {
	test("resolves the source ref from rev-parse calls", async () => {
		const { runner, calls } = scriptedRunner([
			exited({ stdout: "/repo\n" }),
			exited({ stdout: "feature/widgets\n" }),
			exited({ stdout: `${SHA.toUpperCase()}\n` }),
		]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.resolveSourceRef({ cwd: "/repo/sub" });

		expect(result).toEqual({
			ok: true,
			value: { repoRoot: "/repo", branch: "feature/widgets", headSha: SHA },
		});
		expect(calls.map((call) => call.args.join(" "))).toEqual([
			"rev-parse --show-toplevel",
			"rev-parse --abbrev-ref HEAD",
			"rev-parse HEAD",
		]);
	});

	test("classifies a detached HEAD", async () => {
		const { runner } = scriptedRunner([
			exited({ stdout: "/repo\n" }),
			exited({ stdout: "HEAD\n" }),
		]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.resolveSourceRef({ cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("detached-head");
	});

	test("pushes the anchor ref as revision:refs/heads/branch", async () => {
		const { runner, calls } = scriptedRunner([exited()]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.pushAnchorBranch({
			cwd: "/repo",
			revision: SHA,
			anchorBranch: "dispatch/feature-widgets-ab12cd34",
		});

		expect(result.ok).toBe(true);
		expect(calls[0]?.args).toEqual([
			"push",
			"origin",
			`${SHA}:refs/heads/dispatch/feature-widgets-ab12cd34`,
		]);
	});

	test("surfaces push failures with the first stderr line", async () => {
		const { runner } = scriptedRunner([
			exited({ code: 1, stderr: "error: failed to push some refs\nhint: ..." }),
		]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.pushSourceBranch({ cwd: "/repo", branch: "feature/widgets" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("failed to push some refs");
			expect(result.error.message).not.toContain("hint:");
		}
	});
});

describe("real anchor PR gateway", () => {
	test("opens the anchor PR through gh and parses the PR url", async () => {
		const { runner, calls } = scriptedRunner([
			exited({ stdout: "https://github.com/nseng-ai/ns/pull/612\n" }),
		]);
		const gateway = createRealDispatchAnchorPrGateway(runner);
		const result = await gateway.openAnchorPr({
			cwd: "/repo",
			anchorBranch: "dispatch/feature-ab12cd34",
			baseBranch: "feature",
			title: "[dispatch] Do a thing",
			body: "Body",
		});

		expect(result).toEqual({
			ok: true,
			value: { number: 612, url: "https://github.com/nseng-ai/ns/pull/612" },
		});
		expect(calls[0]?.command).toBe("gh");
		expect(calls[0]?.args).toEqual([
			"pr",
			"create",
			"--head",
			"dispatch/feature-ab12cd34",
			"--base",
			"feature",
			"--title",
			"[dispatch] Do a thing",
			"--body",
			"Body",
		]);
	});

	test("stamps the run id by composing the existing PR body", async () => {
		const { runner, calls } = scriptedRunner([
			exited({ stdout: JSON.stringify({ body: "Existing body." }) }),
			exited(),
		]);
		const gateway = createRealDispatchAnchorPrGateway(runner);
		const result = await gateway.stampAnchorPrRunId({
			cwd: "/repo",
			prNumber: 612,
			runId: "wf-run-1",
		});

		expect(result.ok).toBe(true);
		expect(calls[0]?.args.slice(0, 3)).toEqual(["pr", "view", "612"]);
		expect(calls[1]?.args.slice(0, 3)).toEqual(["pr", "edit", "612"]);
		const editedBody = calls[1]?.args.at(-1);
		expect(editedBody).toContain("Existing body.");
		expect(editedBody).toContain(buildDispatchRunIdStamp("wf-run-1"));
	});
});

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
		const result = await gateway.checkTriggerIdentity({
			deploymentUrl: "https://ns-dispatch.example.vercel.app",
			oidcToken: "fake-token",
		});

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
			await unauthorized.checkTriggerIdentity({ deploymentUrl: "https://x.test", oidcToken: "t" }),
		).toEqual({ type: "unauthorized" });

		const failingFetch: typeof fetch = async () => {
			throw new Error("connect ECONNREFUSED");
		};
		const failing = createRealDispatchTriggerGateway(failingFetch);
		const result = await failing.checkTriggerIdentity({
			deploymentUrl: "https://x.test",
			oidcToken: "t",
		});
		expect(result.type).toBe("unreachable");
	});

	test("starts the dispatch workflow and returns the run id", async () => {
		const { fetchFn, requests } = fakeFetch(() =>
			Response.json({ runId: "wf-run-9", workflow: "dispatch" }, { status: 200 }),
		);
		const gateway = createRealDispatchTriggerGateway(fetchFn);
		const result = await gateway.startDispatchRun({
			deploymentUrl: "https://ns-dispatch.example.vercel.app",
			oidcToken: "fake-token",
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
			deploymentUrl: "https://x.test",
			oidcToken: "t",
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
			deploymentUrl: "https://x.test",
			oidcToken: "t",
			input: { revision: SHA, anchorBranch: "dispatch/a-b", anchorPrNumber: 1, prompt: "p" },
		});

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("unexpected-response");
	});
});

describe("real local token gateway", () => {
	test("prefers the process environment value by name", async () => {
		const gateway = createRealDispatchLocalTokenGateway({
			env: { VERCEL_OIDC_TOKEN: "env-token" },
		});
		expect(await gateway.readDevelopmentOidcToken()).toEqual({
			type: "found",
			token: "env-token",
		});
	});

	test("reports a missing token by name with the pull guidance", async () => {
		const gateway = createRealDispatchLocalTokenGateway({
			env: {},
			envLocalPath: join(tmpdir(), "ns-dispatch-nonexistent", ".env.local"),
		});
		const result = await gateway.readDevelopmentOidcToken();

		expect(result.type).toBe("missing");
		if (result.type === "missing") {
			expect(result.detail).toContain("VERCEL_OIDC_TOKEN");
			expect(result.detail).toContain("vercel env pull");
		}
	});
});
