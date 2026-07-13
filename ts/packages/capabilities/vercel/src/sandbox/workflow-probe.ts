// Probe-2 (sandbox-in-workflow) core: the verified private-repository
// Sandbox hello probe driven from inside a workflow step, with the clone
// token minted in-process through the mint core (no HTTP hop to /api/mint).
// This module is the testable body of the `workflows/sandbox-probe.ts`
// step: it resolves the deployable's runtime configuration, builds the
// in-process minter and the Sandbox gateway, and delegates to the proven
// probe orchestration (exact-SHA checkout, safe marker/HEAD verification,
// cleanup on every path). The returned result is a plain serializable value
// that never carries token material — step results are durable run state.
import type { DispatchTokenMinter } from "../mint/mint-core.ts";
import { createGitHubAppDispatchTokenMinter } from "../mint/real-gateways.ts";
import {
	parseMintRuntimeConfig,
	type MintEnvironment,
	type MintRuntimeConfig,
} from "../mint/runtime-config.ts";
import {
	runSandboxHelloProbe,
	type CloneTokenMintGateway,
	type SandboxHelloProbeResult,
	type VercelSandboxGateway,
} from "./hello-probe.ts";
import { createRealVercelSandboxGateway } from "./real-sandbox-gateway.ts";

export interface WorkflowSandboxProbeOptions {
	readonly revision: string;
	readonly environment: MintEnvironment;
}

export type WorkflowSandboxProbeResult =
	| SandboxHelloProbeResult
	| {
			readonly ok: false;
			readonly code: "probe-misconfigured";
			readonly message: string;
	  };

export interface WorkflowSandboxProbeGateways {
	readonly createDispatchTokenMinter: (config: MintRuntimeConfig) => DispatchTokenMinter;
	readonly createSandboxGateway: () => VercelSandboxGateway;
}

export async function runWorkflowSandboxProbe(
	options: WorkflowSandboxProbeOptions,
	gateways: WorkflowSandboxProbeGateways = defaultWorkflowSandboxProbeGateways(),
): Promise<WorkflowSandboxProbeResult> {
	const configResult = parseMintRuntimeConfig(options.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (configResult.ok === false) {
		return {
			ok: false,
			code: "probe-misconfigured",
			// Variable name only — never an environment value.
			message: `Sandbox probe configuration is invalid: ${configResult.error.variable}.`,
		};
	}

	const config = configResult.value;
	return await runSandboxHelloProbe(
		{
			repository: config.githubRepository,
			revision: options.revision,
			credentials: { type: "function-workload-identity" },
		},
		{
			cloneTokens: createMinterCloneTokenGateway(gateways.createDispatchTokenMinter(config)),
			sandboxes: gateways.createSandboxGateway(),
		},
	);
}

/**
 * Adapt the mint core's {@link DispatchTokenMinter} to the probe's
 * clone-token seam. The token stays in-memory between the mint and the
 * Sandbox clone injection; nothing here logs, persists, or returns it.
 */
export function createMinterCloneTokenGateway(minter: DispatchTokenMinter): CloneTokenMintGateway {
	return {
		async mintCloneToken(options) {
			const mintResult = await minter.mintDispatchToken({
				repository: options.repository,
				purpose: "clone",
			});
			if (mintResult.ok === false) return { ok: false };
			return { ok: true, token: mintResult.value.token };
		},
	};
}

function defaultWorkflowSandboxProbeGateways(): WorkflowSandboxProbeGateways {
	return {
		createDispatchTokenMinter: (config) => createGitHubAppDispatchTokenMinter(config),
		createSandboxGateway: () => createRealVercelSandboxGateway(),
	};
}
