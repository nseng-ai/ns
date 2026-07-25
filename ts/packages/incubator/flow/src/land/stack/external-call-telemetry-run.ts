import process from "node:process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Clock } from "@nseng-ai/foundation/clock";
import {
	requireXdgPath,
	resolveNsXdgPath,
	ensurePrivateParentDirectory,
} from "@nseng-ai/extension-kit/xdg";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	cloneQuotaEstimate,
	type FlowLandExternalCallCategory,
	type FlowLandExternalCallQuotaEstimate,
	type FlowLandExternalCallStatus,
	type FlowLandExternalCallTelemetryEvent,
	type FlowLandExternalCallTelemetrySink,
	type FlowLandExternalCallTransport,
} from "./external-call-telemetry.ts";
import {
	summarizeExternalCalls,
	type FlowLandTelemetryTotals,
} from "./external-call-telemetry-summary.ts";

export {
	formatFlowLandTelemetrySummary,
	summarizeExternalCalls,
} from "./external-call-telemetry-summary.ts";
export type {
	FlowLandTelemetryCategorySummary,
	FlowLandTelemetryQuotaSummary,
	FlowLandTelemetrySummaryInput,
	FlowLandTelemetryTotals,
} from "./external-call-telemetry-summary.ts";

export const FLOW_LAND_TELEMETRY_DIAGNOSTICS_SCHEMA_VERSION = 2;

export interface FlowLandExternalCallDiagnostic {
	transport: FlowLandExternalCallTransport;
	category: FlowLandExternalCallCategory;
	operation: string;
	elapsedMs: number;
	status: FlowLandExternalCallStatus;
	exitCode?: number;
	isKilled?: boolean;
	quota?: FlowLandExternalCallQuotaEstimate;
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
		...optionalEntry("exitCode", event.exitCode),
		...optionalEntry("isKilled", event.isKilled),
		...optionalEntry("quota", cloneQuotaEstimate(event.quota)),
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
			resolveNsXdgPath({
				kind: "state",
				env: options.env,
				segments: ["flow", "land", "runs"],
			}),
		);
	} catch (error) {
		return { type: "skipped", reason: skipReasonFromUnknown(error) };
	}

	const path = join(directory, `${options.diagnostics.runId}.json`);
	try {
		await options.gateway.writeJsonFile(
			path,
			`${JSON.stringify(options.diagnostics, null, "\t")}\n`,
		);
		return { type: "written", path };
	} catch (error) {
		return { type: "skipped", reason: skipReasonFromUnknown(error) };
	}
}

function copyTelemetryEvent(
	event: FlowLandExternalCallTelemetryEvent,
): FlowLandExternalCallTelemetryEvent {
	const { quota, ...rest } = event;
	return {
		...rest,
		...optionalEntry("quota", cloneQuotaEstimate(quota)),
	};
}

function skipReasonFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const realTelemetryDiagnosticsGateway: FlowLandTelemetryDiagnosticsGateway = {
	async writeJsonFile(path, content) {
		await ensurePrivateParentDirectory(path);
		await writeFile(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
	},
};
