import { GRAPHITE_COMMAND_NAME } from "@nseng-ai/capability-kit/graphite/branch";
import { commandSucceeded, type ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
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
	isKilled?: boolean;
	quota?: FlowLandExternalCallQuotaEstimate;
}

export type FlowLandExternalCallTelemetrySink = (event: FlowLandExternalCallTelemetryEvent) => void;

export interface CommandInvocation {
	command: string;
	args: readonly string[];
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
		status: commandSucceeded(input.result) ? "success" : "failure",
		...optionalEntry(
			"exitCode",
			input.result.type === "spawn-failed" ? undefined : (input.result.code ?? undefined),
		),
		isKilled: wasCommandKilled(input.result),
		...optionalEntry("quota", cloneQuotaEstimate(classification.quota)),
	};
}

function wasCommandKilled(result: ExecResult): boolean {
	return (
		result.type === "cancelled" ||
		result.type === "timed-out" ||
		(result.type === "exited" && result.signal !== null)
	);
}

export function classifyCommandInvocation(
	invocation: CommandInvocation,
): CommandInvocationClassification {
	const { command, args } = invocation;
	if (command === GRAPHITE_COMMAND_NAME) {
		return {
			category: "graphite",
			operation: args.length > 0 ? `gt ${args[0]}` : command,
		};
	}
	if (command === "ns" && isReadGraphiteBranchMetadataArgs(args)) {
		return {
			category: "graphite",
			operation: "ns flow exec read-graphite-branch-metadata",
		};
	}
	if (command === "gh") return classifyGithubCliInvocation(args);
	if (command === "git") {
		return {
			category: "git",
			operation: typeof args[0] === "string" ? `git ${args[0]}` : command,
		};
	}
	return { category: "other-command", operation: command };
}

function classifyGithubCliInvocation(args: readonly string[]): CommandInvocationClassification {
	if (args[0] === "pr" && args[1] === "view" && args.includes("--json")) {
		return {
			category: "github-cli",
			operation: "gh pr view",
			quota: {
				kind: "static",
				provider: "github",
				graphqlRequests: 1,
				restRequests: 0,
				rateLimitCost: 1,
				description: "gh pr view --json uses one GraphQL query",
			},
		};
	}
	if (args[0] === "pr" && args[1] === "merge") {
		return {
			category: "github-cli",
			operation: "gh pr merge",
			quota: {
				kind: "static",
				provider: "github",
				graphqlRequests: 2,
				restRequests: 0,
				rateLimitCost: 2,
				description: "gh pr merge uses one PR finder query plus one mergePullRequest mutation",
			},
		};
	}
	if (args[0] === "repo" && args[1] === "view" && args.includes("--json")) {
		return {
			category: "github-cli",
			operation: "gh repo view",
			quota: {
				kind: "static",
				provider: "github",
				graphqlRequests: 1,
				restRequests: 0,
				rateLimitCost: 1,
				description: "gh repo view --json uses one GraphQL query",
			},
		};
	}
	if (args[0] === "api" && args[1] === "graphql") {
		const branchCount = countGraphqlHeadFieldArguments(args);
		return {
			category: "github-cli",
			operation: "gh api graphql",
			quota: {
				kind: "static",
				provider: "github",
				graphqlRequests: 1,
				restRequests: 0,
				rateLimitCost: Math.max(1, branchCount),
				description:
					branchCount > 0
						? "gh api graphql batched PR facts uses one GraphQL query with one PR connection per branch"
						: "gh api graphql uses one GraphQL query",
			},
		};
	}
	if (args[0] === "pr" && typeof args[1] === "string") {
		return { category: "github-cli", operation: `gh pr ${args[1]}` };
	}
	if (args[0] === "repo" && typeof args[1] === "string") {
		return { category: "github-cli", operation: `gh repo ${args[1]}` };
	}
	return { category: "github-cli", operation: "gh" };
}

export function cloneQuotaEstimate(
	quota: FlowLandExternalCallQuotaEstimate | undefined,
): FlowLandExternalCallQuotaEstimate | undefined {
	if (quota === undefined) return undefined;
	return { ...quota };
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
