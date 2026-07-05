import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import type {
	FlowLandExternalCallCategory,
	FlowLandExternalCallQuotaEstimate,
	FlowLandExternalCallStatus,
} from "./external-call-telemetry.ts";

export interface FlowLandTelemetryCategorySummary {
	category: FlowLandExternalCallCategory;
	calls: number;
	elapsedMs: number;
	failures: number;
}

export interface FlowLandTelemetryQuotaSummary {
	graphqlRequests: number;
	restRequests: number;
	rateLimitCost: number;
}

export interface FlowLandTelemetryTotals {
	calls: number;
	elapsedMs: number;
	failures: number;
	byCategory: FlowLandTelemetryCategorySummary[];
	githubQuota: FlowLandTelemetryQuotaSummary;
}

export interface FlowLandExternalCallSummaryItem {
	category: FlowLandExternalCallCategory;
	elapsedMs: number;
	status: FlowLandExternalCallStatus;
	quota?: FlowLandExternalCallQuotaEstimate;
}

export interface FlowLandTelemetrySummaryInput {
	diagnostics: {
		totals: FlowLandTelemetryTotals;
	};
	write: { type: "written"; path: string } | { type: "skipped"; reason: string };
}

export function summarizeExternalCalls(
	externalCalls: readonly FlowLandExternalCallSummaryItem[],
): FlowLandTelemetryTotals {
	const categorySummaries = new Map<
		FlowLandExternalCallCategory,
		FlowLandTelemetryCategorySummary
	>();
	const githubQuota: FlowLandTelemetryQuotaSummary = {
		graphqlRequests: 0,
		restRequests: 0,
		rateLimitCost: 0,
	};
	let elapsedMs = 0;
	let failures = 0;
	let calls = 0;
	for (const call of externalCalls) {
		calls += 1;
		elapsedMs += call.elapsedMs;
		if (call.status === "failure") failures += 1;
		let categorySummary = categorySummaries.get(call.category);
		if (categorySummary === undefined) {
			categorySummary = { category: call.category, calls: 0, elapsedMs: 0, failures: 0 };
			categorySummaries.set(call.category, categorySummary);
		}
		categorySummary.calls += 1;
		categorySummary.elapsedMs += call.elapsedMs;
		if (call.status === "failure") categorySummary.failures += 1;
		if (call.quota !== undefined) {
			githubQuota.graphqlRequests += call.quota.graphqlRequests;
			githubQuota.restRequests += call.quota.restRequests;
			githubQuota.rateLimitCost += call.quota.rateLimitCost;
		}
	}
	return {
		calls,
		elapsedMs,
		failures,
		byCategory: [...categorySummaries.values()].sort((left, right) =>
			left.category.localeCompare(right.category),
		),
		githubQuota,
	};
}

export function formatFlowLandTelemetrySummary(result: FlowLandTelemetrySummaryInput): string {
	const lines = [formatTotalsLine(result.diagnostics.totals)];
	const quota = result.diagnostics.totals.githubQuota;
	if (quota.graphqlRequests > 0 || quota.restRequests > 0 || quota.rateLimitCost > 0) {
		lines.push(
			`GitHub quota estimate: GraphQL ${quota.graphqlRequests}, REST ${quota.restRequests}, rate-limit cost ${quota.rateLimitCost}.`,
		);
	}
	if (result.write.type === "written") {
		lines.push(`Telemetry diagnostics: ${result.write.path}`);
	} else {
		lines.push(`Telemetry diagnostics not written: ${result.write.reason}`);
	}
	return lines.join("\n");
}

function formatTotalsLine(totals: FlowLandTelemetryTotals): string {
	if (totals.calls === 0) return "External-call telemetry: no external calls recorded.";
	const categories = totals.byCategory
		.map((item) => `${item.category}: ${item.calls}/${formatTelemetryElapsedMs(item.elapsedMs)}`)
		.join("; ");
	const failureSuffix = totals.failures === 0 ? "" : `; failures: ${totals.failures}`;
	return `External-call telemetry: ${totals.calls} calls in ${formatTelemetryElapsedMs(totals.elapsedMs)} (${categories}${failureSuffix}).`;
}

function formatTelemetryElapsedMs(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${elapsedMs}ms`;
	return formatElapsedMs(elapsedMs);
}
