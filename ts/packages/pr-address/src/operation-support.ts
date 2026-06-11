import { clinkrFailure } from "./clinkr-envelope.ts";
import type { GatewayFailure, PrAddressGitHubGateway } from "./gateways.ts";
import type { ExecOperationDispatchResult, ExecOperationInvocation } from "./operation-registry.ts";

export interface ParsedReadOptions {
	positionals: readonly string[];
	values: ReadonlyMap<string, string>;
	flags: ReadonlySet<string>;
}

export interface ParsePrNumberOperationOptions {
	args: readonly string[];
	commandName: string;
	flagOptions?: readonly string[];
	valueOptions?: readonly string[];
}

export function parsePrNumberOperation(options: ParsePrNumberOperationOptions): { type: "ok"; prNumber: number; flags: ReadonlySet<string>; values: ReadonlyMap<string, string> } | { type: "error"; result: ExecOperationDispatchResult } {
	const parsed = parseReadOptions(options.args, options.valueOptions ?? [], options.flagOptions ?? []);
	if (parsed.type === "error") return { type: "error", result: { type: "exit", exit: clinkrFailure("invalid_request", parsed.message) } };
	const rawPrNumber = parsed.options.positionals[0];
	const prNumber = rawPrNumber === undefined ? Number.NaN : Number(rawPrNumber);
	if (!Number.isInteger(prNumber)) return { type: "error", result: { type: "exit", exit: clinkrFailure("invalid_request", `${options.commandName} requires an integer PR number argument.`) } };
	return { type: "ok", prNumber, flags: parsed.options.flags, values: parsed.options.values };
}

export function parseReadOptions(
	args: readonly string[],
	valueOptions: readonly string[],
	flagOptions: readonly string[],
): { type: "ok"; options: ParsedReadOptions } | { type: "error"; message: string } {
	const positionals: string[] = [];
	const values = new Map<string, string>();
	const flags = new Set<string>();
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--format") {
			index += 1;
			continue;
		}
		if (valueOptions.includes(arg)) {
			const value = args[index + 1];
			if (value === undefined) return { type: "error", message: `${arg} requires a value.` };
			values.set(arg, value);
			index += 1;
			continue;
		}
		if (flagOptions.includes(arg)) {
			flags.add(arg);
			continue;
		}
		if (arg.startsWith("--")) return { type: "error", message: `Unknown option for managed pr-address operation: ${arg}` };
		positionals.push(arg);
	}
	return { type: "ok", options: { positionals, values, flags } };
}

export function githubGateway(invocation: ExecOperationInvocation): { type: "ok"; gateway: PrAddressGitHubGateway } | { type: "error"; result: ExecOperationDispatchResult } {
	const gateway = invocation.deps.context.github;
	if (gateway === undefined) {
		return { type: "error", result: { type: "exit", exit: clinkrFailure("missing_gateway", "This TypeScript pr-address operation requires a GitHub gateway.") } };
	}
	return { type: "ok", gateway };
}

export function gatewayOptions(invocation: ExecOperationInvocation): { cwd: string; env: NodeJS.ProcessEnv } {
	return { cwd: invocation.deps.cwd, env: invocation.deps.env };
}

export function gatewayFailureResult(prefix: string, failure: GatewayFailure): { type: "error"; result: ExecOperationDispatchResult } {
	return { type: "error", result: { type: "exit", exit: clinkrFailure("pr_gateway_failure", gatewayFailureMessage(prefix, failure)) } };
}

export function gatewayFailureDetail(failure: GatewayFailure): string {
	return failure.stderr ?? failure.stdout ?? `exit code ${failure.returncode}`;
}

export function gatewayFailureMessage(prefix: string, failure: GatewayFailure): string {
	return `${prefix}: ${gatewayFailureDetail(failure)}`;
}
