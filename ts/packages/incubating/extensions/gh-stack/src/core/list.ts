import type { GhStackInventoryResult } from "./types.ts";
import { reconcileGhStackInventory } from "./reconcile.ts";
import type { GhStackListContext } from "./gateways/contracts.ts";

export async function listGhStacks(options: {
	readonly context: GhStackListContext;
	readonly limit: number;
}): Promise<GhStackInventoryResult> {
	const installation = await options.context.installation.verifyInstallation();
	if (!installation.ok) return installation;

	const local = await options.context.local.loadLocalStacks();
	if (!local.ok) return local;

	const remote = await options.context.remote.loadRemoteStacks();
	if (!remote.ok) return remote;

	const reconciled = reconcileGhStackInventory({
		local: local.value,
		remote: remote.value,
		limit: options.limit,
	});
	if (!reconciled.ok) {
		return {
			ok: false,
			error: {
				type: "gh-stack-reconciliation-failed",
				evidence: { summary: reconciled.detail },
			},
		};
	}
	return reconciled;
}
