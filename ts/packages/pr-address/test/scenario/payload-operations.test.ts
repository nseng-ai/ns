import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadReference, type PayloadResult } from "../../src/payload-store.ts";
import { prArtifactDescriptor } from "../../src/session-artifacts.ts";
import type { PRDiscussionComment, PRReview, PRReviewThread } from "../../src/gateways.ts";
import { normalizePayloadBytes } from "../support/golden.ts";
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

const FIXTURE_DIR = new URL("../fixtures/payload-operations/", import.meta.url);
const getFeedbackFixture = (await readJsonFixture("get-feedback-payload.json")) as GetFeedbackPayloadFixture;
const readFeedbackDetailsFixture = (await readJsonFixture("read-feedback-details.json")) as ReadFeedbackDetailsFixture;

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

async function writeRawArtifact(root: string, artifact: PayloadArtifactSpec, clockIso: string): Promise<PayloadReference> {
	const store = expectOk(await PayloadStore.open({ root, sessionId: artifact.session_id, clock: fixedClock(clockIso) }));
	return expectOk(await store.writeJsonArtifact({ descriptor: artifact.descriptor, role: "raw", payload: artifact.payload }));
}

describe("get-feedback payload mode parity with the Python CLI", () => {
	test("writes the raw payload artifact and emits the payload manifest envelope byte-for-byte", async () => {
		const root = await makePayloadRoot();
		const github = new InMemoryPrAddressGitHubGateway({
			reviews: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.reviews },
			reviewThreads: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.review_threads },
			discussionComments: { [getFeedbackFixture.pr_number]: getFeedbackFixture.gateway.discussion_comments },
		});

		const run = runScenario(["exec", "get-feedback", String(getFeedbackFixture.pr_number), "--format", "json", "--stdout-mode", "full"], {
			github,
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: getFeedbackFixture.session_id },
			payloadClock: fixedClock(getFeedbackFixture.clock_iso),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(getFeedbackFixture.expected_envelope_text.replaceAll("{ROOT}", root));
		expect(await readFile(join(root, getFeedbackFixture.artifact_relative_path), "utf8")).toBe(getFeedbackFixture.expected_artifact_text);
	});

	test("fails with the Python harness_session_required envelope when no session id is available", async () => {
		const root = await makePayloadRoot();
		const run = runScenario(["exec", "get-feedback", String(getFeedbackFixture.pr_number), "--format", "json", "--stdout-mode", "full"], {
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
			["exec", "get-feedback", String(getFeedbackFixture.pr_number), "--harness-session-id", getFeedbackFixture.session_id, "--format", "json", "--stdout-mode", "full"],
			{ github, env: { ASDL_PAYLOAD_ROOT: root }, payloadClock: fixedClock(getFeedbackFixture.clock_iso) },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(getFeedbackFixture.expected_envelope_text.replaceAll("{ROOT}", root));
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
			["exec", "read-feedback-details", "--selection-json", selectionJsonTemplate.replaceAll("{ROOT}", root), "--format", "json", "--stdout-mode", "full"],
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

describe("read-feedback detail session resolution", () => {
	function rawFeedbackEnvelope(): Record<string, unknown> {
		return {
			exit_code: 0,
			data: {
				reviews: [{ id: "R_1", author: "alice", body: "review body" }],
				review_threads: [
					{
						thread_id: "PRRT_1",
						path: "src/file.ts",
						line: 10,
						start_line: null,
						is_resolved: false,
						is_outdated: false,
						comments: [{ id: 11, author: "bob", body: "thread body" }],
					},
				],
				discussion_comments: [{ comment_id: 99, author: "carol", body: "discussion body" }],
			},
		};
	}

	async function seedRawFeedback(root: string, sessionId: string, prNumber: number): Promise<PayloadReference> {
		return await writeRawArtifact(
			root,
			{ session_id: sessionId, descriptor: prArtifactDescriptor({ prNumber, kind: "feedback" }), payload: rawFeedbackEnvelope() },
			"2026-01-02T03:04:05.000Z",
		);
	}

	test("read-feedback-detail resolves latest raw feedback by PR number", async () => {
		const root = await makePayloadRoot();
		await seedRawFeedback(root, "detail-session", 123);

		const run = runScenario(["exec", "read-feedback-detail", "--pr-number", "123", "--json-pointer", "/data/reviews/0/body", "--format", "json", "--stdout-mode", "full"], {
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "detail-session" },
		});

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as { data: { value: string; resolved_inputs: { feedback: { descriptor: string; role: string } } } };
		expect(envelope.data.value).toBe("review body");
		expect(envelope.data.resolved_inputs.feedback).toMatchObject({ descriptor: "pr-address-pr-123-feedback", role: "raw" });
	});

	test("read-feedback-details accepts top-level PR number with pointer-only selection", async () => {
		const root = await makePayloadRoot();
		await seedRawFeedback(root, "details-session", 456);
		const selection = JSON.stringify({ json_pointers: ["/data/review_threads/0/comments/0/body", "/data/discussion_comments/0"] });

		const run = runScenario(["exec", "read-feedback-details", "--pr-number", "456", "--selection-json", selection, "--format", "json", "--stdout-mode", "full"], {
			env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "details-session" },
			payloadClock: fixedClock("2026-01-02T03:04:06.000Z"),
		});

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as {
			data: {
				selected_payload_reference: { descriptor: string; role: string };
				counts: { requested: number; selected: number; body_values: number; item_values: number };
				resolved_inputs: { feedback: { descriptor: string; role: string } };
			};
		};
		expect(envelope.data.selected_payload_reference).toMatchObject({ descriptor: "pr-address-selected-feedback-details", role: "summary" });
		expect(envelope.data.counts).toEqual({ requested: 2, selected: 2, body_values: 1, item_values: 1 });
		expect(envelope.data.resolved_inputs.feedback).toMatchObject({ descriptor: "pr-address-pr-456-feedback", role: "raw" });
	});

	test("rejects mixed read-feedback-detail sources", async () => {
		const root = await makePayloadRoot();
		const reference = await seedRawFeedback(root, "detail-session", 123);

		const run = runScenario(
			[
				"exec",
				"read-feedback-detail",
				"--payload-path",
				reference.payload_path,
				"--pr-number",
				"123",
				"--json-pointer",
				"/data/reviews/0/body",
				"--format",
				"json",
				"--stdout-mode",
				"full",
			],
			{ env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "detail-session" } },
		);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix --payload-path with --pr-number");
	});

	test("rejects mixed read-feedback-details sources", async () => {
		const selectionWithPath = JSON.stringify({ payload_path: "/tmp/raw.raw.json", json_pointers: ["/data/reviews/0/body"] });
		const cliConflict = runScenario(["exec", "read-feedback-details", "--pr-number", "123", "--selection-json", selectionWithPath, "--format", "json"]);

		expect(await cliConflict.exit).toBe(2);
		const cliEnvelope = JSON.parse(cliConflict.stdout.join("")) as { error_type: string; message: string };
		expect(cliEnvelope.error_type).toBe("invalid_request");
		expect(cliEnvelope.message).toContain("cannot mix --pr-number");

		const selectionConflict = JSON.stringify({ payload_path: "/tmp/raw.raw.json", pr_number: 123, json_pointers: ["/data/reviews/0/body"] });
		const selectionRun = runScenario(["exec", "read-feedback-details", "--selection-json", selectionConflict, "--format", "json"]);

		expect(await selectionRun.exit).toBe(2);
		const selectionEnvelope = JSON.parse(selectionRun.stdout.join("")) as { error_type: string; message: string };
		expect(selectionEnvelope.error_type).toBe("invalid_request");
		expect(selectionEnvelope.message).toContain("selection cannot mix payload_path with pr_number");
	});
});

describe("record-batch-checkpoint session-only cutover", () => {
	test("rejects removed composed payload options as usage errors", async () => {
		const run = runScenario(["exec", "record-batch-checkpoint", "--payload-json", "{}", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("unknown option '--payload-json'");
	});
});
