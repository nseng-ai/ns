import { failure, type ClinkrFailureExit } from "@asdl/clinkr";
import type { PrAddressExecContext } from "./exec-operation.ts";
import type { GatewayFailure, GatewayOptions } from "./gateways.ts";

/** Generic record guard shared by payload/classification input handling. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
