import { describe, expect, test } from "vitest";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import {
	createFlowLandTelemetryRun,
	formatFlowLandTelemetrySummary,
	type FlowLandTelemetryDiagnosticsGateway,
} from "../../src/land/stack/external-call-telemetry-run.ts";
import type { FlowLandExternalCallTelemetryEvent } from "../../src/land/stack/external-call-telemetry.ts";

interface GatewayWrite {
	path: string;
	content: string;
}

class RecordingTelemetryGateway implements FlowLandTelemetryDiagnosticsGateway {
	readonly writes: GatewayWrite[] = [];

	async writeJsonFile(path: string, content: string): Promise<void> {
		this.writes.push({ path, content });
	}
}

describe("flow land external-call telemetry run diagnostics", () => {
	test("writes minimal per-run JSON diagnostics under SDL XDG state", async () => {
		const manualClock = createManualClock(1_000);
		const gateway = new RecordingTelemetryGateway();
		const run = createFlowLandTelemetryRun({
			env: { HOME: "/home/tester", XDG_STATE_HOME: "/xdg-state" },
			clock: manualClock.clock,
			runId: "run-1",
			gateway,
		});

		run.sink(
			telemetryEvent({
				category: "github-cli",
				operation: "gh pr view",
				display: "gh pr view 101 --json number,title,body",
				elapsedMs: 25,
				quota: {
					kind: "static",
					provider: "github",
					graphqlRequests: 1,
					restRequests: 0,
					rateLimitCost: 1,
					description: "gh pr view --json uses one GraphQL query",
				},
			}),
		);
		run.sink(
			telemetryEvent({
				category: "graphite",
				operation: "gt restack",
				display: "gt restack --upstack feature/private-name",
				elapsedMs: 40,
			}),
		);
		manualClock.advanceMs(100);

		const finish = await run.finish(0);

		expect(finish.write).toEqual({
			type: "written",
			path: "/xdg-state/ns/flow/land/runs/run-1.json",
		});
		expect(gateway.writes).toHaveLength(1);
		const write = gateway.writes[0];
		if (write === undefined) throw new Error("expected diagnostics write");
		expect(write.path).toBe("/xdg-state/ns/flow/land/runs/run-1.json");
		const parsed: unknown = JSON.parse(write.content);
		expect(parsed).toEqual({
			schemaVersion: 2,
			runId: "run-1",
			command: "sdl flow land",
			startedAtMs: 1_000,
			finishedAtMs: 1_100,
			durationMs: 100,
			exitCode: 0,
			totals: {
				calls: 2,
				elapsedMs: 65,
				failures: 0,
				byCategory: [
					{ category: "github-cli", calls: 1, elapsedMs: 25, failures: 0 },
					{ category: "graphite", calls: 1, elapsedMs: 40, failures: 0 },
				],
				githubQuota: { graphqlRequests: 1, restRequests: 0, rateLimitCost: 1 },
			},
			externalCalls: [
				{
					transport: "command",
					category: "github-cli",
					operation: "gh pr view",
					elapsedMs: 25,
					status: "success",
					exitCode: 0,
					isKilled: false,
					quota: {
						kind: "static",
						provider: "github",
						graphqlRequests: 1,
						restRequests: 0,
						rateLimitCost: 1,
						description: "gh pr view --json uses one GraphQL query",
					},
				},
				{
					transport: "command",
					category: "graphite",
					operation: "gt restack",
					elapsedMs: 40,
					status: "success",
					exitCode: 0,
					isKilled: false,
				},
			],
		});
		expect(write.content).not.toContain("number,title,body");
		expect(write.content).not.toContain("feature/private-name");
	});

	test("formats a concise verbose summary from collected events", async () => {
		const manualClock = createManualClock(2_000);
		const gateway = new RecordingTelemetryGateway();
		const run = createFlowLandTelemetryRun({
			env: { HOME: "/home/tester" },
			clock: manualClock.clock,
			runId: "run-2",
			gateway,
		});
		run.sink(
			telemetryEvent({
				category: "github-cli",
				operation: "gh pr merge",
				display: "gh pr merge 101 --body sensitive",
				elapsedMs: 1_500,
				quota: {
					kind: "static",
					provider: "github",
					graphqlRequests: 2,
					restRequests: 0,
					rateLimitCost: 2,
					description: "gh pr merge uses one PR finder query plus one mergePullRequest mutation",
				},
			}),
		);
		run.sink(
			telemetryEvent({
				category: "git",
				operation: "git rev-parse",
				display: "git rev-parse HEAD",
				elapsedMs: 500,
				status: "failure",
				exitCode: 1,
			}),
		);

		const summary = formatFlowLandTelemetrySummary(await run.finish(1));

		expect(summary).toBe(
			[
				"External-call telemetry: 2 calls in 2s (git: 1/500ms; github-cli: 1/1s; failures: 1).",
				"GitHub quota estimate: GraphQL 2, REST 0, rate-limit cost 2.",
				"Telemetry diagnostics: /home/tester/.local/state/ns/flow/land/runs/run-2.json",
			].join("\n"),
		);
	});
});

function telemetryEvent(
	overrides: Partial<FlowLandExternalCallTelemetryEvent>,
): FlowLandExternalCallTelemetryEvent {
	return {
		type: "flow_land.external_call",
		transport: "command",
		category: "git",
		operation: "git status",
		display: "git status",
		elapsedMs: 1,
		count: 1,
		status: "success",
		exitCode: 0,
		isKilled: false,
		...overrides,
	};
}
