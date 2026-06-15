import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadReference, type PayloadResult } from "../../src/payload-store.ts";
import { stackArtifactDescriptor } from "../../src/session-artifacts.ts";
import { fixedClock, runScenario, type ScenarioRunOptions } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const newTempDir = useTempDirs();

interface VerifyEnvelope {
	message?: string | undefined;
	data: {
		valid: boolean;
		selected_batch_current: boolean;
		safe_to_build_stack_resolve_payloads: boolean;
		selected_already_resolved: Array<Record<string, unknown>>;
		selected_missing_or_outdated_threads: Array<Record<string, unknown>>;
		unrelated_new_unresolved_threads: Array<Record<string, unknown>>;
		warnings: string[];
		errors: Array<{ code: string; thread_id: string | null }>;
		verification_reference: PayloadReference;
		resolved_inputs: { plan: { descriptor: string }; current_thread_state: { descriptor: string } };
	};
}

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

async function makeRoot(): Promise<string> {
	return join(await newTempDir("pr-address-stack-batch-current-"), "payload-root");
}

async function writeJson(path: string, value: unknown): Promise<string> {
	await writeFile(path, JSON.stringify(value), "utf8");
	return path;
}

async function seedSession(root: string, sessionId: string, options: { plan?: unknown | undefined; threadState?: unknown | undefined }): Promise<void> {
	const store = expectOk(await PayloadStore.open({ root, sessionId, clock: fixedClock("2026-01-02T03:04:05.000Z") }));
	if (options.plan !== undefined) expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: options.plan }));
	if (options.threadState !== undefined) expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("thread-state"), role: "summary", payload: options.threadState }));
}

async function runVerify(root: string, decisions: unknown, options: ScenarioRunOptions = {}) {
	const decisionsFile = await writeJson(join(await newTempDir("pr-address-decisions-"), "decisions.json"), decisions);
	return runScenario(["exec", "verify-stack-batch-current", "--batch-id", "complex", "--decisions-file", decisionsFile, "--format", "json", "--stdout-mode", "full"], {
		...options,
		env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "stack-session", ...(options.env ?? {}) },
		payloadClock: fixedClock("2026-01-02T03:04:06.000Z"),
	});
}

describe("verify-stack-batch-current", () => {
	test("passes selected batch and writes an advisory verification artifact", async () => {
		const root = await makeRoot();
		await seedSession(root, "stack-session", {
			plan: stackPlan(),
			threadState: currentThreadState({ complexThread: thread({ thread_id: "PRRT_complex" }) }),
		});

		const run = await runVerify(root, [decision("PRRT_complex")]);

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as VerifyEnvelope;
		expect(envelope.data.valid).toBe(true);
		expect(envelope.data.selected_batch_current).toBe(true);
		expect(envelope.data.safe_to_build_stack_resolve_payloads).toBe(true);
		expect(envelope.data.verification_reference).toMatchObject({ descriptor: "pr-address-stack-batch-complex-current", role: "summary" });
		expect(envelope.data.resolved_inputs).toMatchObject({ plan: { descriptor: "pr-address-stack-plan" }, current_thread_state: { descriptor: "pr-address-stack-thread-state" } });
	});

	test("reports unrelated drift without blocking the selected batch", async () => {
		const root = await makeRoot();
		await seedSession(root, "stack-session", {
			plan: stackPlan(),
			threadState: currentThreadState({ complexThread: thread({ thread_id: "PRRT_complex" }), otherThreads: [thread({ thread_id: "PRRT_new" })] }),
		});

		const run = await runVerify(root, [decision("PRRT_complex")]);

		expect(await run.exit).toBe(0);
		const envelope = JSON.parse(run.stdout.join("")) as VerifyEnvelope;
		expect(envelope.data.selected_batch_current).toBe(true);
		expect(envelope.data.unrelated_new_unresolved_threads).toHaveLength(1);
		expect(envelope.data.unrelated_new_unresolved_threads[0]).toMatchObject({ thread_id: "PRRT_new" });
		expect(envelope.data.warnings[0]).toContain("unrelated new unresolved");
	});

	test("fails selected batch when a selected thread is already resolved", async () => {
		const root = await makeRoot();
		await seedSession(root, "stack-session", {
			plan: stackPlan(),
			threadState: currentThreadState({ complexThread: thread({ thread_id: "PRRT_complex", is_resolved: true }) }),
		});

		const run = await runVerify(root, [decision("PRRT_complex")]);

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join("")) as VerifyEnvelope;
		expect(envelope.data.selected_batch_current).toBe(false);
		expect(envelope.data.selected_already_resolved[0]).toMatchObject({ thread_id: "PRRT_complex" });
	});

	test("fails selected batch when selected thread metadata changed", async () => {
		const root = await makeRoot();
		await seedSession(root, "stack-session", {
			plan: stackPlan(),
			threadState: currentThreadState({ complexThread: thread({ thread_id: "PRRT_complex", path: "renamed.ts" }) }),
		});

		const run = await runVerify(root, [decision("PRRT_complex")]);

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join("")) as VerifyEnvelope;
		expect(envelope.data.selected_missing_or_outdated_threads[0]).toMatchObject({ thread_id: "PRRT_complex", changed_fields: ["path"] });
	});

	test.each([
		{ name: "other batch", decisions: [decision("PRRT_other", 42)], code: "thread_not_in_selected_batch" },
		{ name: "informational", decisions: [decision("PRRT_info", 42)], code: "informational_thread_not_in_batch" },
		{ name: "unknown", decisions: [decision("PRRT_missing", 42)], code: "unknown_thread_decision" },
		{ name: "duplicate", decisions: [decision("PRRT_complex"), decision("PRRT_complex")], code: "duplicate_thread_decision" },
		{ name: "missing", decisions: [], code: "missing_thread_decision" },
	])("rejects invalid $name decisions", async ({ decisions, code }) => {
		const root = await makeRoot();
		await seedSession(root, "stack-session", {
			plan: stackPlan(),
			threadState: currentThreadState({ complexThread: thread({ thread_id: "PRRT_complex" }) }),
		});

		const run = await runVerify(root, decisions);

		expect(await run.exit).toBe(1);
		const envelope = JSON.parse(run.stdout.join("")) as VerifyEnvelope;
		expect(envelope.data.valid).toBe(false);
		expect(envelope.data.safe_to_build_stack_resolve_payloads).toBe(false);
		expect(envelope.data.errors.map((error) => error.code)).toContain(code);
	});

	test("missing thread-state guidance names the required predecessor command", async () => {
		const root = await makeRoot();
		await seedSession(root, "stack-session", { plan: stackPlan() });
		const run = await runVerify(root, [decision("PRRT_complex")]);

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("payload_lookup_failed");
		expect(envelope.message).toContain("pr-address-stack-thread-state");
		expect(envelope.message).toContain("pr-address exec stack-feedback-thread-state --stack-reference <stack-reference> --format json");
	});
});

function stackPlan(): Record<string, unknown> {
	return {
		valid: true,
		pr_count: 1,
		validation: { all_valid: true, per_pr: [{ pr_number: 42, valid: true, counts: {}, errors: [] }] },
		batches: [
			{
				batch_id: "complex",
				complexity: "complex",
				approval_required: false,
				items: [planItem({ thread_id: "PRRT_complex", source_batch_id: "complex" })],
			},
			{
				batch_id: "other",
				complexity: "local",
				approval_required: false,
				items: [planItem({ thread_id: "PRRT_other", source_batch_id: "other" })],
			},
		],
		informational: [planItem({ thread_id: "PRRT_info", source_batch_id: null })],
	};
}

function planItem(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		pr_number: 42,
		branch: "feature",
		title: "Feature",
		url: "https://example.com/pr/42",
		source_kind: "review_thread",
		summary: "Fix the helper.",
		thread_id: "PRRT_complex",
		path: "file.ts",
		line: 10,
		start_line: null,
		is_outdated: false,
		...overrides,
	};
}

function currentThreadState(options: { complexThread: Record<string, unknown>; otherThreads?: Array<Record<string, unknown>> | undefined }): Record<string, unknown> {
	const threads = [options.complexThread, thread({ thread_id: "PRRT_other" }), thread({ thread_id: "PRRT_info" }), ...(options.otherThreads ?? [])];
	return {
		harness_session_id: "stack-session",
		include_resolved: true,
		stack_thread_state_reference: null,
		summary: { prs: 1, review_threads: threads.length, unresolved_review_threads: threads.filter((item) => item.is_resolved !== true).length, resolved_review_threads: threads.filter((item) => item.is_resolved === true).length },
		stack: [
			{
				pr_number: 42,
				branch: "feature",
				title: "Feature",
				url: "https://example.com/pr/42",
				head_ref_name: "feature",
				base_ref_name: "main",
				review_threads: threads,
				counts: { review_threads: threads.length, unresolved_review_threads: threads.filter((item) => item.is_resolved !== true).length, resolved_review_threads: threads.filter((item) => item.is_resolved === true).length },
			},
		],
	};
}

function thread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { thread_id: "PRRT_complex", path: "file.ts", line: 10, start_line: null, is_resolved: false, is_outdated: false, comment_count: 1, ...overrides };
}

function decision(threadId: string, prNumber = 42): Record<string, unknown> {
	return { pr_number: prNumber, thread_id: threadId, action: "resolve", mode: "fixed", message: "Fixed.", commit_sha: null, provenance: null, skip_reason: null };
}
