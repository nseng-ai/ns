import type { CommandExecApi } from "@nseng-ai/foundation/exec";

import { createDispatchSourcePublicationClient } from "./source-publication/real-source-publication.ts";
import type {
	DispatchPublicationEngineMutationEvidence,
	DispatchSourcePublicationClient,
} from "./source-publication/source-publication.ts";

import type {
	DispatchGraphitePublicationAuthorizationGateway,
	DispatchGraphitePublicationResult,
	DispatchSourcePublicationGateway,
} from "./contracts.ts";
import type { DispatchSourcePublicationMutationEvidence } from "./lifecycle.ts";

interface DispatchPublicationInteraction {
	isInteractive(): boolean;
	confirm(request: {
		readonly message: string;
		readonly defaultAnswer: "yes" | "no";
	}): Promise<{ readonly type: "confirmed" | "declined" | "aborted" }>;
}

export interface CreateRealDispatchSourcePublicationGatewayOptions {
	readonly cwd: string;
	readonly commands: CommandExecApi;
	readonly env?: NodeJS.ProcessEnv;
}

/** Bind dispatch source publication to the caller's local command channel. */
export function createRealDispatchSourcePublicationGateway(
	options: CreateRealDispatchSourcePublicationGatewayOptions,
): DispatchSourcePublicationGateway {
	return createDispatchSourcePublicationGatewayFromClient(
		createDispatchSourcePublicationClient(options),
	);
}

/** Package-private seam for fake-driven translation tests. */
export function createDispatchSourcePublicationGatewayFromClient(
	client: DispatchSourcePublicationClient,
): DispatchSourcePublicationGateway {
	return {
		async planGraphitePublication(options) {
			const result = await client.planCurrentBranch({
				expectedSource: {
					branch: options.expectedBranch,
					headSha: options.expectedHeadSha,
				},
			});
			if (result.type === "tracked") {
				return {
					type: "tracked",
					plan: {
						trunkBranch: result.plan.trunkBranch,
						affectedBranches: [...result.plan.affectedBranches],
					},
				};
			}
			if (result.type === "not-graphite-tracked") {
				return { type: "not-graphite-tracked" };
			}
			return {
				type: "failed",
				stage: result.stage,
				code: result.error.code,
				message: result.error.message,
				mutation: translateMutation(result.mutation),
			};
		},
		async publishGraphiteSource(options): Promise<DispatchGraphitePublicationResult> {
			const result = await client.submitCurrentBranch({
				type: "planned",
				expectedPlan: {
					source: {
						branch: options.expectedBranch,
						headSha: options.expectedHeadSha,
					},
					trunkBranch: options.expectedPlan.trunkBranch,
					affectedBranches: [...options.expectedPlan.affectedBranches],
				},
				restack: true,
				force: false,
				onPhase: (event) => {
					if (event.status === "started") options.onPhase?.(event.stage);
				},
			});
			if (result.type === "submitted") {
				return {
					type: "published",
					source: { ...result.source },
					mutation: translateMutation(result.mutation),
				};
			}
			return {
				type: "failed",
				stage: result.stage,
				code: result.error.code,
				message: result.error.message,
				mutation: translateMutation(result.mutation),
			};
		},
	};
}

/** Authorize only the planned Graphite mutation; Graphite's own safeguards remain enabled. */
export function createRealDispatchGraphitePublicationAuthorizationGateway(
	interaction: DispatchPublicationInteraction,
): DispatchGraphitePublicationAuthorizationGateway {
	return {
		async authorizeGraphitePublication(options) {
			if (options.isForceAuthorized) return { type: "authorized", method: "force" };
			if (!interaction.isInteractive()) return { type: "non-interactive-force-required" };
			const scope = options.affectedBranches.map((branch) => `  - ${branch}`).join("\n");
			const confirmation = await interaction.confirm({
				message: [
					"Dispatch must publish this Graphite source scope before creating an anchor:",
					scope,
					"",
					"Graphite may restack these branches, rewrite local history, and update their remote pull requests.",
					"Dispatch will not bypass Graphite remote-divergence safeguards.",
				].join("\n"),
				defaultAnswer: "no",
			});
			return confirmation.type === "confirmed"
				? { type: "authorized", method: "interactive" }
				: { type: "declined" };
		},
	};
}

function translateMutation(
	mutation: DispatchPublicationEngineMutationEvidence,
): DispatchSourcePublicationMutationEvidence {
	return { local: mutation.local, remote: mutation.remote };
}
