// The real Workflow Analytics adapter behind DispatchRunRecoveryGateway.
// `world.analytics` is served from the Vercel observability pipeline and is
// optional on the Workflow world (the local development world leaves it
// undefined), so the adapter feature-detects it rather than assuming it.
// Vendor vocabulary is deliberate (no backend-agnostic executor contract);
// vendor response shapes are zod-validated at this boundary and never leak
// inward. Live Analytics behavior on Vercel is pending verification.
// `loadWorld` is the test seam; production callers use the default binding.
import { getWorld } from "workflow/runtime";
import { z } from "zod";

import type { DispatchRunRecoveryGateway, DispatchRunRecoveryListResult } from "./run-recovery.ts";
import { DISPATCH_ID_ATTRIBUTE } from "./workflow-observability.ts";

/**
 * The narrow slice of the Workflow world this adapter reads. The vendor
 * `World` type from `workflow/runtime` is structurally assignable; results
 * stay `unknown` here and are validated before use.
 */
export interface DispatchRunAnalyticsWorld {
	readonly analytics?: {
		readonly runs: {
			list(params: {
				readonly attributes: Readonly<Record<string, string>>;
				readonly pagination: { readonly limit: number };
			}): Promise<unknown>;
		};
	};
}

export type LoadDispatchRunAnalyticsWorld = () => Promise<DispatchRunAnalyticsWorld>;

const analyticsRunListingSchema = z.object({
	data: z.array(z.object({ runId: z.string() })),
});

export function createWorkflowAnalyticsRunRecoveryGateway(
	loadWorld: LoadDispatchRunAnalyticsWorld = getWorld,
): DispatchRunRecoveryGateway {
	return {
		async listRunIdsByDispatchId(options): Promise<DispatchRunRecoveryListResult> {
			let world: DispatchRunAnalyticsWorld;
			try {
				world = await loadWorld();
			} catch {
				return { type: "error" };
			}
			const analytics = world.analytics;
			if (analytics === undefined) return { type: "analytics-unavailable" };

			let listing: unknown;
			try {
				listing = await analytics.runs.list({
					attributes: { [DISPATCH_ID_ATTRIBUTE]: options.dispatchId },
					pagination: { limit: options.maxRuns },
				});
			} catch {
				return { type: "error" };
			}

			const parsed = analyticsRunListingSchema.safeParse(listing);
			if (parsed.success === false) return { type: "error" };
			return { type: "listed", runIds: parsed.data.data.map((run) => run.runId) };
		},
	};
}
