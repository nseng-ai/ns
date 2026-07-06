import { describe, expect, test } from "vitest";
import {
	classifyCommandInvocation,
	commandExternalCallTelemetryEvent,
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

	test("classifies the updatePullRequest base-retarget mutation with a single-request quota", () => {
		expect(
			classifyCommandInvocation({
				command: "gh",
				args: [
					"api",
					"graphql",
					"-f",
					"pullRequestId=PR_node_102",
					"-f",
					"baseRefName=main",
					"-f",
					"query=mutation($pullRequestId:ID!,$baseRefName:String!){updatePullRequest(input:{pullRequestId:$pullRequestId,baseRefName:$baseRefName}){pullRequest{id number baseRefName}}}",
				],
			}),
		).toMatchObject({
			category: "github-cli",
			operation: "gh api graphql updatePullRequest",
			quota: { graphqlRequests: 1, restRequests: 0, rateLimitCost: 1 },
		});
	});

	test("does not infer batched GraphQL branch count from query-only aliases", () => {
		expect(
			classifyCommandInvocation({
				command: "gh",
				args: [
					"api",
					"graphql",
					"-f",
					"query=query { repository { head0: pullRequests(first: 1) { nodes { number } } head1: pullRequests(first: 1) { nodes { number } } } }",
				],
			}).quota,
		).toMatchObject({ rateLimitCost: 1 });
	});

	test("renames command telemetry killed field to isKilled", () => {
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
			isKilled: true,
		});
		expect("killed" in event).toBe(false);
		expect("wasKilled" in event).toBe(false);
	});
});
