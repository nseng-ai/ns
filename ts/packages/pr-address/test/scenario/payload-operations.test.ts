import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadResult } from "../../src/payload-store.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread } from "../../src/gateways.ts";
import { normalizePayloadBytes } from "../support/golden.ts";
import { expectedHarnessSessionRelativePath, expectedHarnessSessionText } from "../support/harness-session.ts";
import { InMemoryPrAddressGitHubGateway } from "../support/in-memory-pr-address-gateways.ts";
import { fixedClock, runScenario, type ScenarioRun } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

interface GetFeedbackPayloadFixture {
	session_id: string;
	clock_iso: string;
	pr_number: number;
	gateway: {
		reviews: PRReview[];
		review_threads: PRReviewThread[];
		discussion_comments: PRDiscussionComment[];
	};
	artifact_relative_path: string;
	expected_artifact_text: string;
	expected_envelope_text: string;
	expected_session_required_envelope_text: string;
}

interface PayloadArtifactSpec {
	session_id: string;
	descriptor: string;
	payload: unknown;
}

interface ReadFeedbackDetailsFixture {
	raw_clock_iso: string;
	summary_clock_iso: string;
	artifacts: PayloadArtifactSpec[];
	success: {
		selection_json_template: string;
		expected_envelope_text: string;
		expected_summary_relative_path: string;
		expected_summary_text: string;
	};
	error_cases: Array<{
		name: string;
		selection_json_template: string;
		expected_exit_code: number;
		expected_envelope_text: string;
	}>;
}

interface RecordBatchCheckpointFixture {
	raw_clock_iso: string;
	summary_clock_iso: string;
	cases: Array<{
		name: string;
		session_id: string;
		raw_artifact: PayloadArtifactSpec | null;
		input_json_template: string;
		expected_exit_code: number;
		expected_envelope_text: string;
		expected_summary_relative_path: string | null;
		expected_summary_text: string | null;
	}>;
}

const FIXTURE_DIR = new URL("../fixtures/payload-operations/", import.meta.url);
const getFeedbackFixture = (await readJsonFixture("get-feedback-payload.json")) as GetFeedbackPayloadFixture;
const readFeedbackDetailsFixture = (await readJsonFixture("read-feedback-details.json")) as ReadFeedbackDetailsFixture;
const recordBatchCheckpointFixture = (await readJsonFixture("record-batch-checkpoint.json")) as RecordBatchCheckpointFixture;

const makeTempDir = useTempDirs();

async function readJsonFixture(name: string): Promise<unknown> {
	return JSON.parse(await readFile(new URL(name, FIXTURE_DIR), "utf8"));
}

async function makePayloadRoot(): Promise<string> {
	return join(await makeTempDir("pr-address-payload-operations-"), "payload-root");
}

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

function payloadBytesOfReference(envelopeText: string, referenceKey: string): number {
	const envelope = JSON.parse(envelopeText) as { data: Record<string, { payload_bytes: number }> };
	const reference = envelope.data[referenceKey];
	if (reference === undefined) throw new Error(`envelope is missing data.${referenceKey}`);
	return reference.payload_bytes;
}

async function writeRawArtifact(root: string, artifact: PayloadArtifactSpec, clockIso: string): Promise<void> {
	const store = expectOk(await PayloadStore.open({ root, sessionId: artifact.session_id, clock: fixedClock(clockIso) }));
	expectOk(await store.writeJsonArtifact({ descriptor: artifact.descriptor, role: "raw", payload: artifact.payload }));
}

describe("get-feedback payload mode parity with the Python CLI", () => {
	test("writes the raw payload artifact and emits the payload manifest envelope byte-for-byte", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({
			reviews: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.reviews },
			reviewThreads: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.review_threads },
			discussionComments: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.discussion_comments },
		});

		const run = runScenario(["exec", "get-feedback", String(getFeedbackFixture.pr_number), "--format", "json"], {
			github,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: getFeedbackFixture.session_id },
			payloadClock: fixedClock(getFeedbackFixture.clock_iso),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(expectedHarnessSessionText(getFeedbackFixture.expected_envelope_text.replaceAll("{ROOT}", root), getFeedbackFixture.session_id));
		expect(await readFile(join(root, expectedHarnessSessionRelativePath(getFeedbackFixture.artifact_relative_path, getFeedbackFixture.session_id)), "utf8")).toBe(
			getFeedbackFixture.expected_artifact_text,
		);
	});

	test("fails with the Python harness_session_required envelope when no session id is available", async () => {
		const root = await makePayloadRoot();
		const run = runScenario(["exec", "get-feedback", String(getFeedbackFixture.pr_number), "--format", "json"], {
			github: new InMemoryPrAddressGitHubGateway(),
			env: { ASDL_PAYLOAD_ROOT: root },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(getFeedbackFixture.expected_session_required_envelope_text);
	});

	test("honors an explicit --harness-session-id over the environment", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({
			reviews: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.reviews },
			reviewThreads: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.review_threads },
			discussionComments: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.discussion_comments },
		});

		const run = runScenario(
			["exec", "get-feedback", String(getFeedbackFixture.pr_number), "--harness-session-id", getFeedbackFixture.session_id, "--format", "json"],
			{ github, env: { ASDL_PAYLOAD_ROOT: root }, payloadClock: fixedClock(getFeedbackFixture.clock_iso) },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(expectedHarnessSessionText(getFeedbackFixture.expected_envelope_text.replaceAll("{ROOT}", root), getFeedbackFixture.session_id));
	});
});

describe("read-feedback-details parity with the Python CLI", () => {
	async function seedDetailsRoot(): Promise<string> {
		const root = await makePayloadRoot();
		for (const artifact of readFeedbackDetailsFixture.artifacts) {
			await writeRawArtifact(root, artifact, readFeedbackDetailsFixture.raw_clock_iso);
		}
		return root;
	}

	function runSelection(selectionJsonTemplate: string, root: string): ScenarioRun {
		return runScenario(
			["exec", "read-feedback-details", "--selection-json", selectionJsonTemplate.replaceAll("{ROOT}", root), "--format", "json"],
			{ payloadClock: fixedClock(readFeedbackDetailsFixture.summary_clock_iso) },
		);
	}

	test("selects details into a summary artifact byte-for-byte", async () => {
		const root = await seedDetailsRoot();
		const successRun = runSelection(readFeedbackDetailsFixture.success.selection_json_template, root);
		expect(await successRun.exit).toBe(0);
		const successEnvelope = successRun.stdout.join("");
		expect(normalizePayloadBytes(successEnvelope)).toBe(
			normalizePayloadBytes(readFeedbackDetailsFixture.success.expected_envelope_text.replaceAll("{ROOT}", root)),
		);
		const summaryText = await readFile(join(root, readFeedbackDetailsFixture.success.expected_summary_relative_path), "utf8");
		expect(summaryText).toBe(readFeedbackDetailsFixture.success.expected_summary_text.replaceAll("{ROOT}", root));
		expect(payloadBytesOfReference(successEnvelope, "selected_payload_reference")).toBe(Buffer.byteLength(summaryText, "utf8"));
	});

	test("reports lookup failures byte-for-byte", async () => {
		const root = await seedDetailsRoot();
		// The not-raw-role case targets the summary artifact; materialize it as
		// explicit setup by replaying the success selection (the fixed clock
		// makes the artifact path deterministic).
		const setupRun = runSelection(readFeedbackDetailsFixture.success.selection_json_template, root);
		expect(await setupRun.exit).toBe(0);

		for (const errorCase of readFeedbackDetailsFixture.error_cases) {
			const run = runSelection(errorCase.selection_json_template, root);
			expect(await run.exit, errorCase.name).toBe(errorCase.expected_exit_code);
			expect(run.stdout.join(""), errorCase.name).toBe(errorCase.expected_envelope_text.replaceAll("{ROOT}", root));
		}
	});
});

describe("record-batch-checkpoint parity with the Python CLI", () => {
	for (const checkpointCase of recordBatchCheckpointFixture.cases) {
		test(`matches Python envelope and artifact for ${checkpointCase.name}`, async () => {
			const root = await makePayloadRoot();
			if (checkpointCase.raw_artifact !== null) {
				await writeRawArtifact(root, checkpointCase.raw_artifact, recordBatchCheckpointFixture.raw_clock_iso);
			}

			const run = runScenario(
				["exec", "record-batch-checkpoint", "--payload-json", checkpointCase.input_json_template.replaceAll("{ROOT}", root), "--format", "json"],
				{ payloadClock: fixedClock(recordBatchCheckpointFixture.summary_clock_iso) },
			);

			expect(await run.exit).toBe(checkpointCase.expected_exit_code);
			const envelopeText = run.stdout.join("");
			expect(normalizePayloadBytes(envelopeText)).toBe(normalizePayloadBytes(checkpointCase.expected_envelope_text.replaceAll("{ROOT}", root)));
			if (checkpointCase.expected_summary_relative_path !== null && checkpointCase.expected_summary_text !== null) {
				const summaryText = await readFile(join(root, checkpointCase.expected_summary_relative_path), "utf8");
				expect(summaryText).toBe(checkpointCase.expected_summary_text.replaceAll("{ROOT}", root));
				expect(payloadBytesOfReference(envelopeText, "checkpoint_reference")).toBe(Buffer.byteLength(summaryText, "utf8"));
			}
		});
	}
});
