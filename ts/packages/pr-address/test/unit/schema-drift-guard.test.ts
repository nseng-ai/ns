import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { finalizeRun, finalizeRunInputSchema } from "../../src/finalization.ts";
import { InMemoryPayloadStoreFactory, type PayloadResult } from "../../src/payload-store.ts";
import { prBatchArtifactDescriptor } from "../../src/session-artifacts.ts";
import {
	buildResolveThreadBatchPayload,
	buildResolveThreadBatchPayloadInputSchema,
} from "../../src/resolve-thread-batch-payload.ts";
import { summarizeFeedbackResultSchema } from "../../src/operation-schemas/collection.ts";
import {
	buildResolveThreadBatchPayloadResultSchema,
	finalizeRunResultSchema,
} from "../../src/operation-schemas/payload.ts";
import { resolveThreadBatchResultSchema } from "../../src/operation-schemas/mutation.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread, PRSummary } from "../../src/gateways.ts";
import { goldenCases, readJson, REPO_ROOT } from "../support/golden.ts";
import { InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";
import { fixedClock, runScenario } from "../support/run-scenario.ts";

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

/**
 * Schema drift guards: verify that parity-frozen result schemas from
 * operation-schemas/ still parse representative runtime outputs from golden files
 * or scenario runs.
 *
 * These tests do NOT re-type result shapes — schemas are deliberately frozen for
 * contract stability. Instead, they verify that runtime outputs continue to parse
 * under the doc schemas.
 */

describe("finalize-run drift guard", async () => {
	const finalizeRunCases = await goldenCases("finalize-run");

	for (const goldenCase of finalizeRunCases) {
		test(`finalize-run golden ${goldenCase.name} parses under finalizeRunResultSchema`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			const actual = finalizeRun(finalizeRunInputSchema.parse(input));
			expect(actual).toEqual(expected);

			const parseResult = finalizeRunResultSchema.safeParse(actual);
			expect(parseResult.success, `finalizeRunResultSchema should parse golden ${goldenCase.name}`).toBe(true);
		});
	}
});

describe("build-resolve-thread-batch-payload drift guard", async () => {
	const buildResolveThreadBatchPayloadCases = await goldenCases("build-resolve-thread-batch-payload");

	for (const goldenCase of buildResolveThreadBatchPayloadCases) {
		test(`build-resolve-thread-batch-payload golden ${goldenCase.name} parses under buildResolveThreadBatchPayloadResultSchema`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			const actual = buildResolveThreadBatchPayload(buildResolveThreadBatchPayloadInputSchema.parse(input));
			expect(actual).toEqual(expected);

			const parseResult = buildResolveThreadBatchPayloadResultSchema.safeParse(actual);
			expect(parseResult.success, `buildResolveThreadBatchPayloadResultSchema should parse golden ${goldenCase.name}`).toBe(true);
		});
	}
});

interface SummarizeFeedbackFixture {
	gateway: {
		pr: PRSummary;
		reviews: PRReview[];
		review_threads: PRReviewThread[];
		discussion_comments: PRDiscussionComment[];
	};
}

describe("summarize-feedback drift guard", async () => {
	const fixture = JSON.parse(await readFile(new URL("../fixtures/summarize-feedback/summarize-feedback.json", import.meta.url), "utf8")) as SummarizeFeedbackFixture;

	test("successful summarize-feedback scenario output parses under summarizeFeedbackResultSchema", async () => {
		const github = new InMemoryPrAddressGitHubGateway({
			prs: [fixture.gateway.pr],
			reviews: { [fixture.gateway.pr.number]: fixture.gateway.reviews },
			reviewThreads: { [fixture.gateway.pr.number]: fixture.gateway.review_threads },
			discussionComments: { [fixture.gateway.pr.number]: fixture.gateway.discussion_comments },
		});
		const run = runScenario(["exec", "summarize-feedback", String(fixture.gateway.pr.number), "--format", "json"], { github });

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as { data: unknown };
		const parseResult = summarizeFeedbackResultSchema.safeParse(envelope.data);
		expect(parseResult.success, "summarizeFeedbackResultSchema should parse successful scenario data").toBe(true);
	});
});

describe("resolve-thread-batch drift guard", () => {
	test("partial resolve-thread-batch scenario output parses under resolveThreadBatchResultSchema", async () => {
		const github = new InMemoryPrAddressGitHubGateway({ threadReplyFailureIds: new Set(["PRRT_fail"]) });
		const env = { PATH: "/fake/bin", ASDL_PAYLOAD_ROOT: "/payload-root", HARNESS_SESSION_ID: "sess-1" };
		const payloadStoreFactory = new InMemoryPayloadStoreFactory({ clock: fixedClock("2026-06-10T12:00:00Z") });
		const store = expectOk(await payloadStoreFactory.fromEnvironment({ env }));
		const reference = expectOk(
			await store.writeJsonArtifact({
				descriptor: prBatchArtifactDescriptor({ prNumber: 42, batchId: "batch-1", kind: "resolve-build" }),
				role: "summary",
				payload: {
					artifact_kind: "thread_resolution_build",
					source: "single_pr",
					pr_number: 42,
					batch_id: "batch-1",
					commit_sha: "abc1234",
					continue_on_error: false,
					payload_ready: true,
					payload: {
						commit_sha: "abc1234",
						continue_on_error: false,
						items: [
							{ thread_id: "PRRT_ok", mode: "fixed", message: "Fixed.", commit_sha: null, provenance: null },
							{ thread_id: "PRRT_fail", mode: "fixed", message: "Fails.", commit_sha: null, provenance: null },
							{ thread_id: "PRRT_skip", mode: "fixed", message: "Skipped.", commit_sha: null, provenance: null },
						],
					},
					resolved_inputs: {
						plan: {
							payload_path: "/payload-root/sessions/sess-1/payloads/20260610t120000z-0001-pr-address-pr-42-plan.summary.json",
							session_id: "sess-1",
							descriptor: "pr-address-pr-42-plan",
							role: "summary",
							created_at_utc: "2026-06-10T12:00:00Z",
							sequence: 1,
							payload_bytes: 2,
							content_type: "application/json",
							extension: "json",
						},
					},
					build: { review_thread_count: 3, resolved_thread_count: 3, skipped_thread_count: 0, skipped_items: [], ignored_non_thread_items: [], warnings: [] },
				},
			}),
		);
		const run = runScenario(["exec", "resolve-thread-batch", "--from-build", reference.payload_path, "--format", "json"], { cwd: REPO_ROOT, github, env, payloadStoreFactory });

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join("")) as { data: unknown };
		const parseResult = resolveThreadBatchResultSchema.safeParse(envelope.data);
		expect(parseResult.success, "resolveThreadBatchResultSchema should parse partial scenario data").toBe(true);
	});
});
