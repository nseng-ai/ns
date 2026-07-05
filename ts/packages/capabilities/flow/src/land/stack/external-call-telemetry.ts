import { GRAPHITE_COMMAND_NAME } from "@ns/capability-kit/graphite/branch";
import type { ExecResult } from "@ns/core/command";
import { optionalEntry } from "@ns/core/primitives";
import { isReadGraphiteBranchMetadataArgs } from "./graphite-command-channel.ts";

export type FlowLandExternalCallTransport = "command" | "github-api";

export type FlowLandExternalCallCategory =
	| "graphite"
	| "github-cli"
	| "github-api"
	| "git"
	| "other-command";

export type FlowLandExternalCallStatus = "success" | "failure";

export interface FlowLandExternalCallQuotaEstimate {
	kind: "static";
	provider: "github";
	graphqlRequests: number;
	restRequests: number;
	rateLimitCost: number;
	description: string;
}

export interface FlowLandExternalCallTelemetryEvent {
	type: "flow_land.external_call";
	transport: FlowLandExternalCallTransport;
	category: FlowLandExternalCallCategory;
	operation: string;
	display: string;
	elapsedMs: number;
	count: 1;
	status: FlowLandExternalCallStatus;
	exitCode?: number;
	wasKilled?: boolean;
	quota?: FlowLandExternalCallQuotaEstimate;
}

export type FlowLandExternalCallTelemetrySink = (event: FlowLandExternalCallTelemetryEvent) => void;

export interface CommandInvocationMetadata {
	githubGraphqlBranchCount?: number;
}

export interface CommandInvocation {
	command: string;
	args: readonly string[];
	metadata?: CommandInvocationMetadata;
}

export interface CommandInvocationClassification {
	category: FlowLandExternalCallCategory;
	operation: string;
	quota?: FlowLandExternalCallQuotaEstimate;
}

export interface CommandTelemetryInput extends CommandInvocation {
	commandDisplay: string;
	elapsedMs: number;
	result: ExecResult;
}

export function commandExternalCallTelemetryEvent(
	input: CommandTelemetryInput,
): FlowLandExternalCallTelemetryEvent {
	const classification = classifyCommandInvocation(input);
	return {
		type: "flow_land.external_call",
		transport: "command",
		category: classification.category,
		operation: classification.operation,
		display: input.commandDisplay,
		elapsedMs: input.elapsedMs,
		count: 1,
		status: input.result.code === 0 ? "success" : "failure",
		exitCode: input.result.code,
		wasKilled: Boolean(input.result.killed),
		...optionalEntry("quota", cloneQuotaEstimate(classification.quota)),
	};
}

export interface GithubApiTelemetryInput {
	operation: string;
	display: string;
	elapsedMs: number;
	status: FlowLandExternalCallStatus;
	quota?: FlowLandExternalCallQuotaEstimate;
}

export function githubApiExternalCallTelemetryEvent(
	input: GithubApiTelemetryInput,
): FlowLandExternalCallTelemetryEvent {
	return {
		type: "flow_land.external_call",
		transport: "github-api",
		category: "github-api",
		operation: input.operation,
		display: input.display,
		elapsedMs: input.elapsedMs,
		count: 1,
		status: input.status,
		...optionalEntry("quota", cloneQuotaEstimate(input.quota)),
	};
}

export function classifyCommandInvocation(
	invocation: CommandInvocation,
): CommandInvocationClassification {
	return {
		category: commandExternalCallCategory(invocation),
		operation: commandExternalCallOperation(invocation),
		...optionalEntry("quota", staticQuotaForInvocation(invocation)),
	};
}

function commandExternalCallCategory(invocation: CommandInvocation): FlowLandExternalCallCategory {
	if (invocation.command === GRAPHITE_COMMAND_NAME) return "graphite";
	if (invocation.command === "ns" && isReadGraphiteBranchMetadataArgs(invocation.args)) {
		return "graphite";
	}
	if (invocation.command === "gh") return "github-cli";
	if (invocation.command === "git") return "git";
	return "other-command";
}

function commandExternalCallOperation(invocation: CommandInvocation): string {
	const { command, args } = invocation;
	if (command === GRAPHITE_COMMAND_NAME && args.length > 0) return `gt ${args[0]}`;
	if (command === "gh" && args[0] === "pr" && typeof args[1] === "string") {
		return `gh pr ${args[1]}`;
	}
	if (command === "gh" && args[0] === "repo" && typeof args[1] === "string") {
		return `gh repo ${args[1]}`;
	}
	if (command === "gh" && args[0] === "api" && args[1] === "graphql") {
		return "gh api graphql";
	}
	if (command === "git" && typeof args[0] === "string") return `git ${args[0]}`;
	if (command === "ns" && isReadGraphiteBranchMetadataArgs(args)) {
		return "ns flow exec read-graphite-branch-metadata";
	}
	return command;
}

export function staticQuotaForCommand(
	command: string,
	args: readonly string[],
): FlowLandExternalCallQuotaEstimate | undefined {
	return staticQuotaForInvocation({ command, args });
}

function staticQuotaForInvocation(
	invocation: CommandInvocation,
): FlowLandExternalCallQuotaEstimate | undefined {
	const { command, args } = invocation;
	if (command !== "gh") return undefined;
	if (args[0] === "pr" && args[1] === "view" && args.includes("--json")) {
		return {
			kind: "static",
			provider: "github",
			graphqlRequests: 1,
			restRequests: 0,
			rateLimitCost: 1,
			description: "gh pr view --json uses one GraphQL query",
		};
	}
	if (args[0] === "pr" && args[1] === "merge") {
		return {
			kind: "static",
			provider: "github",
			graphqlRequests: 2,
			restRequests: 0,
			rateLimitCost: 2,
			description: "gh pr merge uses one PR finder query plus one mergePullRequest mutation",
		};
	}
	if (args[0] === "repo" && args[1] === "view" && args.includes("--json")) {
		return {
			kind: "static",
			provider: "github",
			graphqlRequests: 1,
			restRequests: 0,
			rateLimitCost: 1,
			description: "gh repo view --json uses one GraphQL query",
		};
	}
	if (args[0] === "api" && args[1] === "graphql") {
		const branchCount = batchedPullRequestFactsBranchCount(invocation);
		return {
			kind: "static",
			provider: "github",
			graphqlRequests: 1,
			restRequests: 0,
			rateLimitCost: Math.max(1, branchCount),
			description:
				branchCount > 0
					? "gh api graphql batched PR facts uses one GraphQL query with one PR connection per branch"
					: "gh api graphql uses one GraphQL query",
		};
	}
	return undefined;
}

export function cloneQuotaEstimate(
	quota: FlowLandExternalCallQuotaEstimate | undefined,
): FlowLandExternalCallQuotaEstimate | undefined {
	if (quota === undefined) return undefined;
	return { ...quota };
}

function batchedPullRequestFactsBranchCount(invocation: CommandInvocation): number {
	if (invocation.metadata?.githubGraphqlBranchCount !== undefined) {
		return invocation.metadata.githubGraphqlBranchCount;
	}
	return countGraphqlHeadFieldArguments(invocation.args);
}

function countGraphqlHeadFieldArguments(args: readonly string[]): number {
	let count = 0;
	for (let index = 0; index < args.length - 1; index += 1) {
		if (args[index] === "-F" && isGraphqlHeadVariable(args[index + 1])) count += 1;
	}
	return count;
}

function isGraphqlHeadVariable(value: string | undefined): boolean {
	return value !== undefined && /^head\d+=/.test(value);
}
