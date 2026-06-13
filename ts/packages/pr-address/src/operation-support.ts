import { failure, type ClinkrFailureExit } from "@asdl/clinkr";
import type { PrAddressExecContext } from "./exec-operation.ts";
import type { GatewayFailure, GatewayOptions, PrAddressGitHubGateway } from "./gateways.ts";

export function githubGateway(ctx: PrAddressExecContext): { type: "ok"; gateway: PrAddressGitHubGateway } | { type: "error"; exit: ClinkrFailureExit } {
	const gateway = ctx.context.github;
	if (gateway === undefined) {
		return { type: "error", exit: failure("missing_gateway", "This TypeScript pr-address operation requires a GitHub gateway.") };
	}
	return { type: "ok", gateway };
}

export function gatewayOptions(ctx: PrAddressExecContext): GatewayOptions {
	return { cwd: ctx.cwd, env: ctx.env };
}

export function gatewayFailureExit(prefix: string, gatewayFailure: GatewayFailure): ClinkrFailureExit {
	return failure("pr_gateway_failure", gatewayFailureMessage(prefix, gatewayFailure));
}

export function gatewayFailureDetail(gatewayFailure: GatewayFailure): string {
	return gatewayFailure.stderr ?? gatewayFailure.stdout ?? `exit code ${gatewayFailure.returncode}`;
}

export function gatewayFailureMessage(prefix: string, gatewayFailure: GatewayFailure): string {
	return `${prefix}: ${gatewayFailureDetail(gatewayFailure)}`;
}
