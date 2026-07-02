import process from "node:process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Clock } from "@ns/core/clock";
import {
	requireXdgPath,
	resolveSdlXdgPath,
	ensurePrivateParentDirectory,
} from "@ns/capability-kit/xdg";
import { formatElapsedMs } from "@ns/core/time-format";
import type {
	FlowLandExternalCallCategory,
	FlowLandExternalCallQuotaEstimate,
	FlowLandExternalCallStatus,
	FlowLandExternalCallTelemetryEvent,
	FlowLandExternalCallTelemetrySink,
	FlowLandExternalCallTransport,
} from "./external-call-telemetry.ts";

export const FLOW_LAND_TELEMETRY_DIAGNOSTICS_SCHEMA_VERSION = 1;

export interface FlowLandExternalCallDiagnostic {
	transport: FlowLandExternalCallTransport;
	category: FlowLandExternalCallCategory;
	operation: string;
	elapsedMs: number;
	status: FlowLandExternalCallStatus;
	exitCode?: number;
	killed?: boolean;
	quota?: FlowLandExternalCallQuotaEstimate;
}

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

export interface FlowLandTelemetryDiagnostics {
	schemaVersion: typeof FLOW_LAND_TELEMETRY_DIAGNOSTICS_SCHEMA_VERSION;
	runId: string;
	command: "sdl flow land";
	startedAtMs: number;
	finishedAtMs: number;
	durationMs: number;
	exitCode: number;
	totals: FlowLandTelemetryTotals;
	externalCalls: FlowLandExternalCallDiagnostic[];
}

export interface FlowLandTelemetryDiagnosticsWrite {
	type: "written";
	path: string;
}

export interface FlowLandTelemetryDiagnosticsSkipped {
	type: "skipped";
	reason: string;
}

export type FlowLandTelemetryDiagnosticsWriteResult =
	| FlowLandTelemetryDiagnosticsWrite
	| FlowLandTelemetryDiagnosticsSkipped;

export interface FlowLandTelemetryRunFinish {
	diagnostics: FlowLandTelemetryDiagnostics;
	write: FlowLandTelemetryDiagnosticsWriteResult;
}

export interface FlowLandTelemetryRun {
	sink: FlowLandExternalCallTelemetrySink;
	finish(exitCode: number): Promise<FlowLandTelemetryRunFinish>;
}

export interface FlowLandTelemetryRunOptions {
	env: Record<string, string | undefined>;
	clock: Clock;
	runId?: string;
	gateway?: FlowLandTelemetryDiagnosticsGateway;
}

export interface FlowLandTelemetryDiagnosticsGateway {
	writeJsonFile(path: string, content: string): Promise<void>;
}

let nextTelemetryRunSerial = 0;

export function createFlowLandTelemetryRun(
	options: FlowLandTelemetryRunOptions,
): FlowLandTelemetryRun {
	const startedAtMs = options.clock.nowMs();
	const runId = options.runId ?? createTelemetryRunId(startedAtMs);
	const events: FlowLandExternalCallTelemetryEvent[] = [];
	const gateway = options.gateway ?? realTelemetryDiagnosticsGateway;

	return {
		sink(event) {
			events.push(copyTelemetryEvent(event));
		},
		async finish(exitCode) {
			const finishedAtMs = Math.max(startedAtMs, options.clock.nowMs());
			const diagnostics = buildFlowLandTelemetryDiagnostics({
				runId,
				startedAtMs,
				finishedAtMs,
				exitCode,
				events,
			});
			const write = await writeFlowLandTelemetryDiagnostics({
				diagnostics,
				env: options.env,
				gateway,
			});
			return { diagnostics, write };
		},
	};
}

export function formatFlowLandTelemetrySummary(result: FlowLandTelemetryRunFinish): string {
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

function createTelemetryRunId(startedAtMs: number): string {
	const serial = nextTelemetryRunSerial;
	nextTelemetryRunSerial += 1;
	return `${Math.trunc(startedAtMs)}-${process.pid}-${serial}`;
}

function buildFlowLandTelemetryDiagnostics(options: {
	runId: string;
	startedAtMs: number;
	finishedAtMs: number;
	exitCode: number;
	events: readonly FlowLandExternalCallTelemetryEvent[];
}): FlowLandTelemetryDiagnostics {
	const externalCalls = options.events.map(toDiagnosticExternalCall);
	const totals = summarizeExternalCalls(externalCalls);
	return {
		schemaVersion: FLOW_LAND_TELEMETRY_DIAGNOSTICS_SCHEMA_VERSION,
		runId: options.runId,
		command: "sdl flow land",
		startedAtMs: options.startedAtMs,
		finishedAtMs: options.finishedAtMs,
		durationMs: Math.max(0, options.finishedAtMs - options.startedAtMs),
		exitCode: options.exitCode,
		totals,
		externalCalls,
	};
}

function toDiagnosticExternalCall(
	event: FlowLandExternalCallTelemetryEvent,
): FlowLandExternalCallDiagnostic {
	return {
		transport: event.transport,
		category: event.category,
		operation: event.operation,
		elapsedMs: event.elapsedMs,
		status: event.status,
		...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
		...(event.killed === undefined ? {} : { killed: event.killed }),
		...(event.quota === undefined ? {} : { quota: { ...event.quota } }),
	};
}

function summarizeExternalCalls(
	externalCalls: readonly FlowLandExternalCallDiagnostic[],
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
	for (const call of externalCalls) {
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
		calls: externalCalls.length,
		elapsedMs,
		failures,
		byCategory: [...categorySummaries.values()].sort((left, right) =>
			left.category.localeCompare(right.category),
		),
		githubQuota,
	};
}

async function writeFlowLandTelemetryDiagnostics(options: {
	diagnostics: FlowLandTelemetryDiagnostics;
	env: Record<string, string | undefined>;
	gateway: FlowLandTelemetryDiagnosticsGateway;
}): Promise<FlowLandTelemetryDiagnosticsWriteResult> {
	let directory: string;
	try {
		directory = requireXdgPath(
			resolveSdlXdgPath({
				kind: "state",
				env: options.env,
				segments: ["flow", "land", "runs"],
			}),
		);
	} catch (error) {
		return { type: "skipped", reason: error instanceof Error ? error.message : String(error) };
	}

	const path = join(directory, `${options.diagnostics.runId}.json`);
	try {
		await options.gateway.writeJsonFile(
			path,
			`${JSON.stringify(options.diagnostics, null, "\t")}\n`,
		);
		return { type: "written", path };
	} catch (error) {
		return { type: "skipped", reason: error instanceof Error ? error.message : String(error) };
	}
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

function copyTelemetryEvent(
	event: FlowLandExternalCallTelemetryEvent,
): FlowLandExternalCallTelemetryEvent {
	return {
		...event,
		...(event.quota === undefined ? {} : { quota: { ...event.quota } }),
	};
}

const realTelemetryDiagnosticsGateway: FlowLandTelemetryDiagnosticsGateway = {
	async writeJsonFile(path, content) {
		await ensurePrivateParentDirectory(path);
		await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
	},
};
