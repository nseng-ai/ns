import { describe, expect, test } from "vitest";

import { RealPrAddressGitGateway, RealPrAddressGitHubGateway, reviewThreadsQuery, type ProcessRequest, type ProcessResult } from "../../src/gateways.ts";

function graphqlResponse(nodes: readonly unknown[]): string {
	return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes } } } } });
}

function gatewayReturning(result: ProcessResult): RealPrAddressGitHubGateway {
	return new RealPrAddressGitHubGateway({ runProcess: async () => result });
}

function commentNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		databaseId: 42,
		body: "looks wrong",
		author: { login: "reviewer" },
		path: "src/app.ts",
		line: 10,
		startLine: 8,
		createdAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

function threadNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: "RT_thread1",
		isResolved: false,
		isOutdated: false,
		path: "src/app.ts",
		line: 12,
		startLine: 9,
		comments: { nodes: [commentNode()] },
		...overrides,
	};
}

describe("RealPrAddressGitHubGateway.getPr", () => {
	test("distinguishes lookup misses from command failures", async () => {
		const miss = await gatewayReturning({ stdout: "", stderr: "no pull requests found for branch", exitCode: 1 }).getPr(1157, { cwd: "/repo" });
		expect(miss).toEqual({ type: "miss", stderr: "no pull requests found for branch", returncode: 1 });

		const failure = await gatewayReturning({ stdout: "partial", stderr: "gh auth failed", exitCode: 4 }).getPr(1157, { cwd: "/repo" });
		expect(failure).toMatchObject({ type: "failure", failure: { stdout: "partial", stderr: "gh auth failed", returncode: 4 } });
	});
});

describe("RealPrAddressGitHubGateway.getReviewThreads", () => {
	test("issues the exact gh GraphQL command with cwd and env passthrough", async () => {
		const requests: ProcessRequest[] = [];
		const gateway = new RealPrAddressGitHubGateway({
			runProcess: async (request) => {
				requests.push(request);
				return { stdout: graphqlResponse([]), stderr: "", exitCode: 0 };
			},
		});
		const env = { PATH: "/fake/bin" };

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", env, shouldIncludeResolved: true });

		expect(result).toEqual({ ok: true, value: [] });
		expect(requests).toEqual([
			{
				command: "gh",
				args: ["api", "graphql", "-F", "owner={owner}", "-F", "repo={repo}", "-F", "number=1157", "-f", `query=${reviewThreadsQuery}`],
				cwd: "/repo",
				env,
				timeout: 30_000,
			},
		]);
		expect(reviewThreadsQuery).toContain("line: originalLine");
		expect(reviewThreadsQuery).toContain("startLine: originalStartLine");
		expect(reviewThreadsQuery).toContain("databaseId");
	});

	test("maps a full GraphQL response to exact domain objects", async () => {
		const gateway = gatewayReturning({ stdout: graphqlResponse([threadNode()]), stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result).toEqual({
			ok: true,
			value: [
				{
					id: "RT_thread1",
					path: "src/app.ts",
					line: 12,
					start_line: 9,
					is_resolved: false,
					is_outdated: false,
					comments: [
						{
							id: 42,
							body: "looks wrong",
							author: "reviewer",
							path: "src/app.ts",
							line: 10,
							start_line: 8,
							created_at: "2026-06-01T00:00:00Z",
						},
					],
				},
			],
		});
	});

	test("maps a null comment author to an empty string", async () => {
		const nodes = [threadNode({ comments: { nodes: [commentNode({ author: null })] } })];
		const gateway = gatewayReturning({ stdout: graphqlResponse(nodes), stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value[0]?.comments[0]?.author).toBe("");
	});

	test("skips thread nodes with a null id", async () => {
		const nodes = [threadNode({ id: null }), threadNode({ id: "RT_kept" })];
		const gateway = gatewayReturning({ stdout: graphqlResponse(nodes), stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.map((thread) => thread.id)).toEqual(["RT_kept"]);
	});

	test("filters resolved threads unless shouldIncludeResolved is set", async () => {
		const nodes = [threadNode({ id: "RT_open" }), threadNode({ id: "RT_resolved", isResolved: true })];
		const stdout = graphqlResponse(nodes);

		const filtered = await gatewayReturning({ stdout, stderr: "", exitCode: 0 }).getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });
		expect(filtered.ok).toBe(true);
		if (filtered.ok) expect(filtered.value.map((thread) => thread.id)).toEqual(["RT_open"]);

		const included = await gatewayReturning({ stdout, stderr: "", exitCode: 0 }).getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: true });
		expect(included.ok).toBe(true);
		if (included.ok) expect(included.value.map((thread) => thread.id)).toEqual(["RT_open", "RT_resolved"]);
	});

	test("returns ok with an empty list for empty nodes", async () => {
		const gateway = gatewayReturning({ stdout: graphqlResponse([]), stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result).toEqual({ ok: true, value: [] });
	});

	test("returns failure preserving stdout, stderr, and returncode on non-zero exit", async () => {
		const gateway = gatewayReturning({ stdout: "partial", stderr: "gh: boom", exitCode: 2 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result).toMatchObject({ ok: false, error: { stdout: "partial", stderr: "gh: boom", returncode: 2 } });
	});

	test("returns failure when the GraphQL body carries errors despite exit 0", async () => {
		const errors = [{ message: "Could not resolve to a PullRequest" }];
		const stdout = JSON.stringify({ data: null, errors });
		const gateway = gatewayReturning({ stdout, stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result).toMatchObject({ ok: false, error: { stdout, stderr: JSON.stringify(errors), returncode: 0 } });
	});

	test("defaults a missing comments.nodes shape to an empty comment list", async () => {
		const nodes = [threadNode({ comments: {} })];
		const gateway = gatewayReturning({ stdout: graphqlResponse(nodes), stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value[0]?.comments).toEqual([]);
	});

	test("drops comments with null or non-numeric ids", async () => {
		const nodes = [threadNode({ comments: { nodes: [commentNode({ databaseId: null }), commentNode({ databaseId: undefined, id: "node-id" }), commentNode({ databaseId: 7 })] } })];
		const gateway = gatewayReturning({ stdout: graphqlResponse(nodes), stderr: "", exitCode: 0 });

		const result = await gateway.getReviewThreads(1157, { cwd: "/repo", shouldIncludeResolved: false });

		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value[0]?.comments.map((comment) => comment.id)).toEqual([7]);
	});
});

describe("RealPrAddressGitGateway", () => {
	test("passes timeout to git commands", async () => {
		const requests: ProcessRequest[] = [];
		const gateway = new RealPrAddressGitGateway({
			runProcess: async (request) => {
				requests.push(request);
				return { stdout: "feature/demo\n", stderr: "", exitCode: 0 };
			},
		});

		const result = await gateway.getCurrentBranch({ cwd: "/repo", env: { PATH: "/fake/bin" } });

		expect(result).toEqual({ type: "branch", branch: "feature/demo" });
		expect(requests).toEqual([
			{
				command: "git",
				args: ["branch", "--show-current"],
				cwd: "/repo",
				env: { PATH: "/fake/bin" },
				timeout: 10_000,
			},
		]);
	});
});
