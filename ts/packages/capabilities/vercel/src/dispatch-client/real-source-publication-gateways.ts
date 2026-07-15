import type {
	FlowMinimalSubmitClient,
	FlowMinimalSubmitMutationEvidence,
} from "@nseng-ai/flow/api";

import type {
	DispatchGraphitePublicationAuthorizationGateway,
	DispatchGraphitePublicationResult,
	DispatchSourcePublicationGateway,
	DispatchSourcePublicationMutationEvidence,
} from "./contracts.ts";

interface DispatchPublicationInteraction {
	isInteractive(): boolean;
	confirm(request: {
		readonly message: string;
		readonly defaultAnswer: "yes" | "no";
	}): Promise<{ readonly type: "confirmed" | "declined" | "aborted" }>;
}

/** Translate Flow's curated minimal-submit API into dispatch source-publication vocabulary. */
export function createRealDispatchSourcePublicationGateway(
	client: FlowMinimalSubmitClient,
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
					plan: { affectedBranches: [...result.plan.affectedBranches] },
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
				expectedSource: {
					branch: options.expectedBranch,
					headSha: options.expectedHeadSha,
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
	mutation: FlowMinimalSubmitMutationEvidence,
): DispatchSourcePublicationMutationEvidence {
	return { local: mutation.local, remote: mutation.remote };
}
