import { describe, expect, test } from "vitest";

import { recordBatchCheckpoint, recordBatchCheckpointInputSchema } from "../../src/batch-checkpoint.ts";
import { finalizeRun, finalizeRunInputSchema } from "../../src/finalization.ts";
import {
	buildGetFeedbackPayloadManifest,
	buildPrepareRunPayloadManifest,
	getFeedbackPayloadManifestInputSchema,
	prepareRunPayloadManifestInputSchema,
	type PrepareRunPayloadManifestInput,
} from "../../src/payload-manifest.ts";
import { buildResolveThreadBatchPayload, buildResolveThreadBatchPayloadInputSchema } from "../../src/resolve-thread-batch-payload.ts";
import { goldenCases, readJson } from "../support/golden.ts";

const getFeedbackPayloadManifestCases = await goldenCases("get-feedback-payload-manifest");
const prepareRunPayloadManifestCases = await goldenCases("prepare-run-payload-manifest");
const buildResolveThreadBatchPayloadCases = await goldenCases("build-resolve-thread-batch-payload");
const recordBatchCheckpointCases = await goldenCases("record-batch-checkpoint");
const finalizeRunCases = await goldenCases("finalize-run");

describe("payload manifest TypeScript parity", () => {
	for (const goldenCase of getFeedbackPayloadManifestCases) {
		test(`get-feedback payload manifest matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(buildGetFeedbackPayloadManifest(getFeedbackPayloadManifestInputSchema.parse(input))).toEqual(expected);
		});
	}

	for (const goldenCase of prepareRunPayloadManifestCases) {
		test(`prepare-run payload manifest matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			const parsedInput: PrepareRunPayloadManifestInput = prepareRunPayloadManifestInputSchema.parse(input);

			expect(buildPrepareRunPayloadManifest(parsedInput)).toEqual(expected);
		});
	}
});

describe("resolve-thread batch payload TypeScript parity", () => {
	for (const goldenCase of buildResolveThreadBatchPayloadCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(buildResolveThreadBatchPayload(buildResolveThreadBatchPayloadInputSchema.parse(input))).toEqual(expected);
		});
	}
});

describe("batch checkpoint TypeScript helper parity", () => {
	for (const goldenCase of recordBatchCheckpointCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(recordBatchCheckpoint(recordBatchCheckpointInputSchema.parse(input))).toEqual(expected);
		});
	}
});

describe("finalize-run TypeScript parity", () => {
	for (const goldenCase of finalizeRunCases) {
		test(`matches golden ${goldenCase.name}`, async () => {
			const input = await readJson(goldenCase.inputPath);
			const expected = await readJson(goldenCase.expectedPath);

			expect(finalizeRun(finalizeRunInputSchema.parse(input))).toEqual(expected);
		});
	}
});
