import { describe, expect, test } from "vitest";
import type { LandLiveProgressEvent } from "../../../src/land/stack/command-stream.ts";
import { summarizeExternalCalls } from "../../../src/land/stack/external-call-telemetry-summary.ts";
import type {
	FlowLandExternalCallCategory,
	FlowLandExternalCallTelemetryEvent,
} from "../../../src/land/stack/external-call-telemetry.ts";
import { BACKUP_ROTATION_ARGS } from "../land-stack-backup-ref-fixtures.ts";
import { expectedSquashMergeArgs } from "../land-stack-script-fixtures.ts";

import {
	backupRefStepsForNumberedBranches,
	linearStackLandingScript,
	mergeNumberedBranch,
	numberedPreflight,
} from "./linear-stack-fixtures.ts";
import { numberedSha } from "./repo-fixtures.ts";
import { commandMessagesText, runLandStack, sameArgs } from "./support.ts";

describe("land-stack command scenarios", () => {
	interface ExternalCallBaselineSummary {
		calls: number;
		failures: number;
		categories: Record<FlowLandExternalCallCategory, number>;
		githubQuota: {
			graphqlRequests: number;
			restRequests: number;
			rateLimitCost: number;
		};
	}

	function summarizeExternalCallBaseline(
		events: readonly FlowLandExternalCallTelemetryEvent[],
	): ExternalCallBaselineSummary {
		const totals = summarizeExternalCalls(events);
		const categories: Record<FlowLandExternalCallCategory, number> = {
			graphite: 0,
			"github-cli": 0,
			"github-api": 0,
			git: 0,
			"other-command": 0,
		};
		for (const item of totals.byCategory) {
			categories[item.category] = item.calls;
		}
		return {
			calls: totals.calls,
			failures: totals.failures,
			categories,
			githubQuota: totals.githubQuota,
		};
	}

	test("large stacks use the same single stack-path confirmation at ten and eleven PRs", async () => {
		for (const size of [10, 11]) {
			const { pi, confirmations } = await runLandStack(
				"",
				numberedPreflight({ end: size, current: size }),
				{ confirms: [false] },
			);

			pi.assertDone();
			expect(confirmations).toHaveLength(1);
			expect(confirmations[0]?.title).toBe("Land this stack path?");
			expect(confirmations[0]?.message).toContain(`Land Graphite stack path: main -> feature-1`);
			expect(confirmations[0]?.message).toContain(`Landing target branch: feature-${size}`);
			expect(confirmations[0]?.message).not.toContain("chunks");
		}
	});
	test("large-stack dry-run shows one full stack path plan without mutation", async () => {
		const { pi, notifications, confirmations } = await runLandStack(
			"--dry-run",
			numberedPreflight({ end: 11, current: 11 }),
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		const message = notifications[0]?.message ?? "";
		expect(message).toContain("Land Graphite stack path: main -> feature-1");
		expect(message).toContain("Landing target branch: feature-11");
		expect(message).toContain("Will merge, in order:");
		expect(message).toContain("  11. #211 feature-11");
		expect(message).not.toContain("Chunks:");
		expect(message).not.toContain("Chunk size");
		expect(message).not.toContain("Land 11 PRs in 2 chunks");
		expect(
			pi.execCalls.some(
				(call) => call.command === "gh" && call.args[0] === "pr" && call.args[1] === "merge",
			),
		).toBe(false);
		expect(
			pi.execCalls.some((call) => call.command === "git" && call.args[0] === "update-ref"),
		).toBe(false);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gt" &&
					["get", "delete", "restack", "submit"].includes(call.args[0] ?? ""),
			),
		).toBe(false);
	});
	test("large-stack --yes lands eleven PRs through one merge loop without chunk progress", async () => {
		const liveProgressEvents: LandLiveProgressEvent[] = [];
		const { pi, notifications, confirmations, messages } = await runLandStack(
			"--yes",
			linearStackLandingScript(11),
			{ executeOptions: { liveProgress: (event) => liveProgressEvents.push(event) } },
		);

		pi.assertDone();
		expect(confirmations).toEqual([]);
		expect(
			pi.execCalls.filter(
				(call) => call.command === "git" && sameArgs(call.args, BACKUP_ROTATION_ARGS),
			),
		).toHaveLength(1);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "git" && call.args[0] === "switch" && call.args.includes("--detach"),
			),
		).toBe(false);
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("→ Preparing to land 11 PRs through feature-11...");
		expect(streamText).not.toContain("Preparing chunk");
		expect(liveProgressEvents).toContainEqual({
			prNumber: 201,
			branch: "feature-1",
		});
		expect(liveProgressEvents).toHaveLength(11);
		expect(streamText).toContain("Landed 11 PRs: #201 feature-1");
		expect(streamText).not.toContain("across 2 chunks");
		expect(streamText).toContain(
			"Local branch feature-11 was kept (still checked out at /repo); delete it manually or run gt sync.",
		);
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("fake-backed large-stack telemetry baseline is stable for representative linear stacks", async () => {
		const baseline = [
			{
				name: "linear-11",
				size: 11,
				expected: {
					calls: 140,
					failures: 0,
					categories: {
						graphite: 54,
						"github-cli": 45,
						"github-api": 0,
						git: 41,
						"other-command": 0,
					},
					githubQuota: { graphqlRequests: 56, restRequests: 0, rateLimitCost: 77 },
				},
			},
			{
				name: "linear-25",
				size: 25,
				expected: {
					calls: 308,
					failures: 0,
					categories: {
						graphite: 124,
						"github-cli": 101,
						"github-api": 0,
						git: 83,
						"other-command": 0,
					},
					githubQuota: { graphqlRequests: 126, restRequests: 0, rateLimitCost: 175 },
				},
			},
		] as const;

		for (const scenario of baseline) {
			const telemetry: FlowLandExternalCallTelemetryEvent[] = [];
			const { pi, confirmations, notifications } = await runLandStack(
				"--yes",
				linearStackLandingScript(scenario.size),
				{ executeOptions: { externalCallTelemetry: (event) => telemetry.push(event) } },
			);

			pi.assertDone();
			expect(confirmations, scenario.name).toEqual([]);
			expect(notifications.at(-1)?.level, scenario.name).toBe("success");
			const restackArgs = pi.execCalls
				.filter((call) => call.command === "gt" && call.args[0] === "restack")
				.map((call) => call.args);
			expect(restackArgs, scenario.name).toHaveLength(scenario.size - 1);
			expect(
				restackArgs.every((args) => args.includes("--only") && !args.includes("--upstack")),
				scenario.name,
			).toBe(true);
			expect(summarizeExternalCallBaseline(telemetry), scenario.name).toEqual(scenario.expected);
		}
	});
	test("interactive large-stack landing asks one stack-path confirmation", async () => {
		const { pi, notifications, confirmations, messages } = await runLandStack(
			"",
			linearStackLandingScript(11),
			{ confirms: [true] },
		);

		pi.assertDone();
		expect(confirmations.map((confirmation) => confirmation.title)).toEqual([
			"Land this stack path?",
		]);
		expect(confirmations[0]?.message).toContain("Land Graphite stack path: main -> feature-1");
		expect(confirmations[0]?.message).toContain("Landing target branch: feature-11");
		expect(confirmations[0]?.message).not.toContain("Chunks");
		expect(commandMessagesText(messages)).toContain("Landed 11 PRs: #201 feature-1");
		expect(notifications.at(-1)?.level).toBe("success");
	});
	test("large-stack failure hard-stops and reports normal partial progress", async () => {
		const script = [
			...numberedPreflight({ end: 11, current: 11 }),
			...backupRefStepsForNumberedBranches(1, 11),
			...Array.from({ length: 9 }, (_, offset) => offset + 1).flatMap((index) =>
				mergeNumberedBranch(index, { next: index + 1, stackEnd: 11 }),
			),
			mergeNumberedBranch(10, { mergeCode: 1 }),
		].flat();
		const { pi, notifications, messages } = await runLandStack("--yes", script);

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("error");
		const streamText = commandMessagesText(messages);
		expect(streamText).toContain("→ Preparing to land 11 PRs through feature-11...");
		expect(streamText).toContain("Already landed:");
		expect(streamText).toContain("  - #201 feature-1");
		expect(streamText).toContain("  - #209 feature-9");
		expect(streamText).not.toContain("by chunk:");
		expect(streamText).toContain("Failed at: #210 feature-10");
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "gh" &&
					sameArgs(
						call.args,
						expectedSquashMergeArgs({ number: 211, sha: numberedSha(11), title: "PR 211" }),
					),
			),
		).toBe(false);
	});
});
