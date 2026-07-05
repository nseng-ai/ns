import { describe, expect, test } from "vitest";
import {
	classifyCommandInvocation,
	commandExternalCallTelemetryEvent,
	githubApiExternalCallTelemetryEvent,
} from "../../src/land/stack/external-call-telemetry.ts";

describe("flow land external-call telemetry classification", () => {
	test("classifies supported command operations and preserves static quota estimates", () => {
		expect(classifyCommandInvocation({ command: "gt", args: ["restack", "--only"] })).toEqual({
			category: "graphite",
			operation: "gt restack",
		});
		expect(
			classifyCommandInvocation({
				command: "ns",
				args: ["flow", "exec", "read-graphite-branch-metadata", "--db-path", "/repo/db"],
			}),
		).toEqual({
			category: "graphite",
			operation: "ns flow exec read-graphite-branch-metadata",
		});
		expect(classifyCommandInvocation({ command: "git", args: ["for-each-ref"] })).toEqual({
			category: "git",
			operation: "git for-each-ref",
		});
		expect(
			classifyCommandInvocation({ command: "gh", args: ["pr", "view", "101", "--json", "number"] }),
		).toMatchObject({
			category: "github-cli",
			operation: "gh pr view",
			quota: { graphqlRequests: 1, restRequests: 0, rateLimitCost: 1 },
		});
		expect(
			classifyCommandInvocation({ command: "gh", args: ["pr", "merge", "101"] }),
		).toMatchObject({
			category: "github-cli",
			operation: "gh pr merge",
			quota: { graphqlRequests: 2, restRequests: 0, rateLimitCost: 2 },
		});
		expect(
			classifyCommandInvocation({
				command: "gh",
				args: ["repo", "view", "--json", "nameWithOwner"],
			}),
		).toMatchObject({
			category: "github-cli",
			operation: "gh repo view",
			quota: { graphqlRequests: 1, restRequests: 0, rateLimitCost: 1 },
		});
	});

	test("counts batched GraphQL PR-fact branches from head field args instead of query aliases", () => {
		const classification = classifyCommandInvocation({
			command: "gh",
			args: [
				"api",
				"graphql",
				"-F",
				"owner=owner",
				"-F",
				"head0=feature-a",
				"-F",
				"head1=feature-b",
				"-f",
				"query=query($head0: String!, $head1: String!) { repository { renamed0: pullRequests(first: 1) { nodes { number } } renamed1: pullRequests(first: 1) { nodes { number } } } }",
			],
		});

		expect(classification).toMatchObject({
			category: "github-cli",
			operation: "gh api graphql",
			quota: {
				graphqlRequests: 1,
				restRequests: 0,
				rateLimitCost: 2,
				description:
					"gh api graphql batched PR facts uses one GraphQL query with one PR connection per branch",
			},
		});
	});

	test("allows explicit GraphQL branch count metadata", () => {
		expect(
			classifyCommandInvocation({
				command: "gh",
				args: [
					"api",
					"graphql",
					"-f",
					"query=query { repository { pullRequests(first: 1) { nodes { number } } } }",
				],
				metadata: { githubGraphqlBranchCount: 3 },
			}).quota,
		).toMatchObject({ rateLimitCost: 3 });
	});

	test("renames command telemetry killed field to wasKilled", () => {
		const event = commandExternalCallTelemetryEvent({
			command: "git",
			args: ["status"],
			commandDisplay: "git status",
			elapsedMs: 5,
			result: { stdout: "", stderr: "", code: 143, killed: true },
		});

		expect(event).toMatchObject({
			category: "git",
			operation: "git status",
			status: "failure",
			exitCode: 143,
			wasKilled: true,
		});
		expect("killed" in event).toBe(false);
	});

	test("keeps direct GitHub API telemetry surface", () => {
		expect(
			githubApiExternalCallTelemetryEvent({
				operation: "mergePullRequest",
				display: "GitHub GraphQL mergePullRequest",
				elapsedMs: 10,
				status: "success",
			}),
		).toMatchObject({
			transport: "github-api",
			category: "github-api",
			operation: "mergePullRequest",
		});
	});
});
