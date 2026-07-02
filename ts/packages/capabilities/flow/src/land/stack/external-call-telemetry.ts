import { GRAPHITE_COMMAND_NAME } from "@ns/capability-kit/graphite/branch";
import type { ExecResult } from "@ns/core/command";
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
	killed?: boolean;
	quota?: FlowLandExternalCallQuotaEstimate;
}

export type FlowLandExternalCallTelemetrySink = (event: FlowLandExternalCallTelemetryEvent) => void;

export interface CommandTelemetryInput {
	command: string;
	args: readonly string[];
	commandDisplay: string;
	elapsedMs: number;
	result: ExecResult;
}

export function commandExternalCallTelemetryEvent(
	input: CommandTelemetryInput,
): FlowLandExternalCallTelemetryEvent {
	const quota = staticQuotaForCommand(input.command, input.args);
	return {
		type: "flow_land.external_call",
		transport: "command",
		category: commandExternalCallCategory(input.command, input.args),
		operation: commandExternalCallOperation(input.command, input.args),
		display: input.commandDisplay,
		elapsedMs: input.elapsedMs,
		count: 1,
		status: input.result.code === 0 ? "success" : "failure",
		exitCode: input.result.code,
		killed: Boolean(input.result.killed),
		...(quota === undefined ? {} : { quota }),
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
		...(input.quota === undefined ? {} : { quota: input.quota }),
	};
}

function commandExternalCallCategory(
	command: string,
	args: readonly string[],
): FlowLandExternalCallCategory {
	if (command === GRAPHITE_COMMAND_NAME) return "graphite";
	if (command === "ns" && isReadGraphiteBranchMetadataArgs(args)) return "graphite";
	if (command === "gh") return "github-cli";
	if (command === "git") return "git";
	return "other-command";
}

function commandExternalCallOperation(command: string, args: readonly string[]): string {
	if (command === GRAPHITE_COMMAND_NAME && args.length > 0) return `gt ${args[0]}`;
	if (command === "gh" && args[0] === "pr" && typeof args[1] === "string") {
		return `gh pr ${args[1]}`;
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
	if (command !== "gh" || args[0] !== "pr") return undefined;
	if (args[1] === "view" && args.includes("--json")) {
		return {
			kind: "static",
			provider: "github",
			graphqlRequests: 1,
			restRequests: 0,
			rateLimitCost: 1,
			description: "gh pr view --json uses one GraphQL query",
		};
	}
	if (args[1] === "merge") {
		return {
			kind: "static",
			provider: "github",
			graphqlRequests: 2,
			restRequests: 0,
			rateLimitCost: 2,
			description: "gh pr merge uses one PR finder query plus one mergePullRequest mutation",
		};
	}
	return undefined;
}
