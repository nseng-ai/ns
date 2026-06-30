import { failure, ok, type RenderCapabilities } from "@sdl/clinkr";
import { renderTextTable } from "@sdl/core/text-table";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { BASE_NAMESPACE, namespaceDisplayLabel, normalizeNamespaceOption } from "../ref-layout.ts";
import { firstFailure, validateNamespaceName, validationMessage } from "../validation.ts";
import { gatewayFailure } from "./shared.ts";

const ALL_NAMESPACES_SCOPE = "all";

export const gcRequestSchema = z.object({
	namespace: z.string().optional().describe("Namespace filter. Omit for all Namespaces."),
	base: z.boolean().default(false).describe("Restrict to Base Namespace."),
	yes: z
		.boolean()
		.default(false)
		.describe("Delete stale Snapshot Refs instead of dry-run preview."),
});

export const gcSnapshotSchema = z.object({
	namespace: z.string(),
	branch: z.string(),
	refName: z.string(),
	entryCount: z.number(),
	deleted: z.boolean(),
});

export const gcResultSchema = z.object({
	namespaceScope: z.string(),
	deleted: z.boolean(),
	staleSnapshots: z.array(gcSnapshotSchema),
});

export type GcRequest = z.infer<typeof gcRequestSchema>;
export type GcSnapshot = z.infer<typeof gcSnapshotSchema>;
export type GcResult = z.infer<typeof gcResultSchema>;

export async function runGc(ctx: BrmemCliContext, request: GcRequest) {
	if (request.base && request.namespace !== undefined) {
		return failure("base-and-namespace-conflict", "--base and --namespace are mutually exclusive.");
	}
	const shouldScanAllNamespaces = !request.base && request.namespace === undefined;
	const scopeNamespace = request.base
		? BASE_NAMESPACE
		: normalizeNamespaceOption(request.namespace);
	const validationFailure = firstFailure([
		"invalid-namespace",
		shouldScanAllNamespaces
			? undefined
			: validationMessage("namespace", scopeNamespace, validateNamespaceName(scopeNamespace)),
	]);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);

	const snapshotsResult = await ctx.gateway.listSnapshots(
		shouldScanAllNamespaces ? {} : { namespace: scopeNamespace },
	);
	if (snapshotsResult.type === "error") return gatewayFailure<GcResult>(snapshotsResult.error);

	const staleSnapshots: GcSnapshot[] = [];
	for (const snapshot of snapshotsResult.value) {
		const presence = await ctx.gateway.localBranchPresence({ branch: snapshot.branch });
		if (presence.type === "error") return gatewayFailure<GcResult>(presence.error);
		if (presence.value === "present") continue;
		if (request.yes) {
			const deleted = await ctx.gateway.deleteSnapshot({
				namespace: snapshot.namespace,
				branch: snapshot.branch,
			});
			if (deleted.type === "error") return gatewayFailure<GcResult>(deleted.error);
		}
		staleSnapshots.push({ ...snapshot, deleted: request.yes });
	}

	return ok({
		namespaceScope: shouldScanAllNamespaces ? ALL_NAMESPACES_SCOPE : scopeNamespace,
		deleted: request.yes,
		staleSnapshots,
	} satisfies GcResult);
}

export function renderGc(
	result: GcResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.staleSnapshots.length === 0) return "No stale Branch Memory Snapshots found.";
	const heading = result.deleted
		? "Deleted stale Branch Memory Snapshots."
		: "Stale Branch Memory Snapshots found. No refs were deleted; rerun with --yes to delete.";
	return [heading, renderGcTable(result.staleSnapshots, caps)].join("\n");
}

function renderGcTable(snapshots: readonly GcSnapshot[], caps: RenderCapabilities): string {
	return renderTextTable({
		columns: [
			{ header: "NAMESPACE", style: "bold-cyan" },
			{ header: "BRANCH" },
			{ header: "SNAPSHOT REF" },
			{ header: "ENTRIES" },
		],
		rows: snapshots.map((snapshot) => [
			namespaceDisplayLabel(snapshot.namespace),
			snapshot.branch,
			snapshot.refName,
			String(snapshot.entryCount),
		]),
		canEmitAnsi: caps.canEmitAnsi,
		shouldDrawRule: true,
		headerStyle: "bold-cyan",
	});
}
