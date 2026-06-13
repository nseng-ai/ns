import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { finalizeRun, finalizeRunInputSchema } from "../../src/finalization.ts";
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
import { runScenario } from "../support/run-scenario.ts";

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
		const payload = {
			commit_sha: "abc1234",
			items: [
				{ thread_id: "PRRT_ok", mode: "fixed", message: "Fixed." },
				{ thread_id: "PRRT_fail", mode: "fixed", message: "Fails." },
				{ thread_id: "PRRT_skip", mode: "fixed", message: "Skipped." },
			],
		};
		const run = runScenario(["exec", "resolve-thread-batch", "--payload-json", JSON.stringify(payload), "--format", "json"], { cwd: REPO_ROOT, github });

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join("")) as { data: unknown };
		const parseResult = resolveThreadBatchResultSchema.safeParse(envelope.data);
		expect(parseResult.success, "resolveThreadBatchResultSchema should parse partial scenario data").toBe(true);
	});
});
