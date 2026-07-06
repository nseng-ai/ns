import { failure, ok, type RenderCapabilities } from "@nseng-ai/clinkr";
import { renderTextTable } from "@nseng-ai/foundation/text-table";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import {
	ALL_NAMESPACES_SCOPE,
	BASE_NAMESPACE,
	namespaceDisplayLabel,
	namespaceScopeLabel,
	namespaceScopeRequest,
	resolveOptionalNamespaceScope,
} from "../ref-layout.ts";
import { firstFailure, validateNamespaceName, validationMessage } from "../validation.ts";
import { gatewayFailure } from "./shared.ts";

const SNAPSHOT_SCAN_PROGRESS_INTERVAL = 100;
const SNAPSHOT_DELETE_PROGRESS_INTERVAL = 100;
const GC_DETAIL_TABLE_LIMIT = 20;

interface GcNamespaceSummary {
	namespace: string;
	snapshotCount: number;
	entryCount: number;
}

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
	const namespaceScope = resolveOptionalNamespaceScope(namespaceScopeRequest(request));
	if (namespaceScope.type === "conflict")
		return failure(namespaceScope.code, namespaceScope.message);
	const scope = namespaceScope.scope;
	const validationFailure = firstFailure([
		"invalid-namespace",
		scope.allNamespaces
			? undefined
			: validationMessage("namespace", scope.namespace, validateNamespaceName(scope.namespace)),
	]);
	if (validationFailure !== undefined) return failure(validationFailure[0], validationFailure[1]);

	writeGcStatus(ctx, "Scanning Branch Memory Snapshot refs…");
	let lastScanProgress = 0;
	const snapshotsResult = await ctx.gateway.listSnapshots({
		...(scope.allNamespaces ? {} : { namespace: scope.namespace }),
		onProgress: ({ processed, total }) => {
			if (
				shouldReportProgress(processed, total, lastScanProgress, SNAPSHOT_SCAN_PROGRESS_INTERVAL)
			) {
				lastScanProgress = processed;
				writeGcStatus(ctx, `Scanned ${processed}/${total} Branch Memory Snapshot refs…`);
			}
		},
	});
	if (snapshotsResult.type === "error") return gatewayFailure<GcResult>(snapshotsResult.error);
	writeGcStatus(ctx, `Found ${snapshotsResult.value.length} Branch Memory Snapshot refs.`);
	writeGcStatus(ctx, "Listing local branches…");
	const localBranches = await ctx.gateway.listLocalBranches();
	if (localBranches.type === "error") return gatewayFailure<GcResult>(localBranches.error);

	const staleSnapshotCandidates = snapshotsResult.value.filter(
		(snapshot) => !localBranches.value.has(snapshot.branch),
	);
	writeGcStatus(ctx, `Found ${staleSnapshotCandidates.length} stale Branch Memory Snapshot refs.`);
	if (request.yes) writeGcStatus(ctx, "Deleting stale Branch Memory Snapshot refs…");

	const staleSnapshots: GcSnapshot[] = [];
	let lastDeleteProgress = 0;
	for (let index = 0; index < staleSnapshotCandidates.length; index += 1) {
		const snapshot = staleSnapshotCandidates[index];
		if (snapshot === undefined) continue;
		if (request.yes) {
			const deleted = await ctx.gateway.deleteSnapshot({
				namespace: snapshot.namespace,
				branch: snapshot.branch,
			});
			if (deleted.type === "error") return gatewayFailure<GcResult>(deleted.error);
			const deletedCount = index + 1;
			if (
				shouldReportProgress(
					deletedCount,
					staleSnapshotCandidates.length,
					lastDeleteProgress,
					SNAPSHOT_DELETE_PROGRESS_INTERVAL,
				)
			) {
				lastDeleteProgress = deletedCount;
				writeGcStatus(
					ctx,
					`Deleted ${deletedCount}/${staleSnapshotCandidates.length} stale Branch Memory Snapshot refs…`,
				);
			}
		}
		staleSnapshots.push({ ...snapshot, deleted: request.yes });
	}

	return ok({
		namespaceScope: namespaceScopeLabel(scope),
		deleted: request.yes,
		staleSnapshots,
	} satisfies GcResult);
}

function writeGcStatus(ctx: BrmemCliContext, message: string): void {
	ctx.stderr(`${message}\n`);
}

function shouldReportProgress(
	processed: number,
	total: number,
	lastReported: number,
	interval: number,
): boolean {
	if (total < interval) return false;
	return processed === total || processed - lastReported >= interval;
}

export function renderGc(
	result: GcResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	if (result.staleSnapshots.length === 0) return "No stale Branch Memory Snapshots found.";
	const heading = result.deleted
		? "Deleted stale Branch Memory Snapshots."
		: "Stale Branch Memory Snapshots found. No refs were deleted; rerun with --yes to delete.";
	if (result.staleSnapshots.length <= GC_DETAIL_TABLE_LIMIT) {
		return [heading, renderGcTable(result.staleSnapshots, caps)].join("\n");
	}
	return [
		heading,
		`Scope: ${formatGcScope(result.namespaceScope)}`,
		`Stale Snapshot refs: ${formatGcCount(result.staleSnapshots.length)}`,
		`Entries in stale Snapshots: ${formatGcCount(sumGcEntries(result.staleSnapshots))}`,
		"By Namespace:",
		renderGcNamespaceSummaryTable(summarizeGcNamespaces(result.staleSnapshots), caps),
		"",
		`Detailed stale ref list omitted from human output because it has ${formatGcCount(result.staleSnapshots.length)} rows.`,
		"Run `brmem gc --format json` for the full list, or narrow with `--base` / `--namespace <name>`.",
	].join("\n");
}

function formatGcScope(namespaceScope: string): string {
	return namespaceScope === ALL_NAMESPACES_SCOPE
		? "all Namespaces"
		: namespaceDisplayLabel(namespaceScope);
}

function formatGcCount(value: number): string {
	return value.toLocaleString("en-US");
}

function sumGcEntries(snapshots: readonly GcSnapshot[]): number {
	return snapshots.reduce((total, snapshot) => total + snapshot.entryCount, 0);
}

function summarizeGcNamespaces(snapshots: readonly GcSnapshot[]): readonly GcNamespaceSummary[] {
	const summaries = new Map<string, GcNamespaceSummary>();
	for (const snapshot of snapshots) {
		const existing = summaries.get(snapshot.namespace);
		if (existing === undefined) {
			summaries.set(snapshot.namespace, {
				namespace: snapshot.namespace,
				snapshotCount: 1,
				entryCount: snapshot.entryCount,
			});
			continue;
		}
		existing.snapshotCount += 1;
		existing.entryCount += snapshot.entryCount;
	}
	return [...summaries.values()].sort(compareGcNamespaceSummaries);
}

function compareGcNamespaceSummaries(left: GcNamespaceSummary, right: GcNamespaceSummary): number {
	if (left.namespace === BASE_NAMESPACE && right.namespace !== BASE_NAMESPACE) return -1;
	if (right.namespace === BASE_NAMESPACE && left.namespace !== BASE_NAMESPACE) return 1;
	return left.namespace.localeCompare(right.namespace);
}

function renderGcNamespaceSummaryTable(
	summaries: readonly GcNamespaceSummary[],
	caps: RenderCapabilities,
): string {
	return renderTextTable({
		columns: [
			{ header: "NAMESPACE", style: "bold-cyan" },
			{ header: "SNAPSHOTS" },
			{ header: "ENTRIES" },
		],
		rows: summaries.map((summary) => [
			namespaceDisplayLabel(summary.namespace),
			formatGcCount(summary.snapshotCount),
			formatGcCount(summary.entryCount),
		]),
		canEmitAnsi: caps.canEmitAnsi,
		shouldDrawRule: true,
		headerStyle: "bold-cyan",
	});
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
