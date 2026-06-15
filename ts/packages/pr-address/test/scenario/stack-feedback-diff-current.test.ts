import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadResult } from "../../src/payload-store.ts";
import { diffStackFeedbackCurrent } from "../../src/stack-feedback-diff-current.ts";
import { stackArtifactDescriptor } from "../../src/session-artifacts.ts";
import { fixedClock, runScenario, type ScenarioRun, type ScenarioRunOptions } from "../support/run-scenario.ts";
import { useTempDirs } from "../support/temp.ts";

const newTempDir = useTempDirs();

function makeTempDir(): Promise<string> {
	return newTempDir("pr-address-stack-diff-");
}

interface DiffEnvelope {
	message?: string | undefined;
	data: {
		safe_to_resolve_planned: boolean;
		summary: Record<string, number>;
		missing_or_outdated_planned_threads: Array<Record<string, unknown>>;
		new_unresolved_threads: Array<Record<string, unknown>>;
		errors: Array<{ code: string }>;
		resolved_inputs?: {
			stack_plan: { descriptor: string; sequence: number };
			current_thread_state: { descriptor: string; sequence: number };
		};
	};
}

function expectOk<T>(result: PayloadResult<T>): T {
	if (result.type !== "ok") throw new Error(`expected ok payload result, got ${result.errorType}: ${result.message}`);
	return result.value;
}

function runDiffWithArgs(args: readonly string[], stdinText = "", options: ScenarioRunOptions = {}): ScenarioRun {
	return runScenario(["exec", "stack-feedback-diff-current", ...args, "--format", "json", "--stdout-mode", "full"], { ...options, stdin: stdinText });
}

describe("stack-feedback-diff-current", () => {
	test("returns ok when planned actionable threads still match current feedback", async () => {
		const result = diffStackFeedbackCurrent({
			stack_plan: stackPlan({ threadId: "PRRT_1" }),
			current_thread_state: currentThreadState({ threads: [thread({ thread_id: "PRRT_1", is_resolved: false })] }),
		});

		expect(result.safe_to_resolve_planned).toBe(true);
		expect(result.summary).toMatchObject({ planned_still_unresolved: 1, new_unresolved_threads: 0 });
	});

	test("returns negative when current feedback has drift", async () => {
		const result = diffStackFeedbackCurrent({
			stack_plan: stackPlan({ threadId: "PRRT_1" }),
			current_thread_state: currentThreadState({ threads: [thread({ thread_id: "PRRT_1", path: "renamed.ts", is_resolved: false }), thread({ thread_id: "PRRT_new", is_resolved: false })] }),
		});

		expect(result.safe_to_resolve_planned).toBe(false);
		expect(result.missing_or_outdated_planned_threads[0]).toMatchObject({ thread_id: "PRRT_1", reason: "metadata_changed", changed_fields: ["path"] });
		expect(result.new_unresolved_threads[0]).toMatchObject({ thread_id: "PRRT_new" });
	});

	test("validates stack membership and duplicate planned threads", async () => {
		const plan = stackPlan({ threadId: "PRRT_1" });
		plan.batches[0]?.items.push({ ...plan.batches[0].items[0] });
		const result = diffStackFeedbackCurrent({
			stack_plan: plan,
			current_thread_state: currentThreadState({ prNumber: 100, threads: [thread({ thread_id: "PRRT_1" })] }),
		});

		expect(result.errors.map((error) => error.code)).toEqual(["missing_current_pr", "unknown_current_pr", "duplicate_planned_thread"]);
	});
});

describe("stack-feedback-diff-current session inputs", () => {
	async function seedSession(root: string, sessionId: string, options: { plan: unknown; threadState?: unknown | undefined; prep?: unknown | undefined }): Promise<void> {
		const store = expectOk(await PayloadStore.open({ root, sessionId, clock: fixedClock("2026-01-02T03:04:05.000Z") }));
		expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: options.plan }));
		if (options.prep !== undefined) expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("prep"), role: "summary", payload: options.prep }));
		if (options.threadState !== undefined) expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("thread-state"), role: "summary", payload: options.threadState }));
	}

	test("resolves latest stack plan and current thread-state from an empty-stdin harness session", async () => {
		const root = join(await makeTempDir(), "payload-root");
		await seedSession(root, "stack-session", {
			plan: stackPlan({ threadId: "PRRT_1" }),
			threadState: currentThreadState({ threads: [thread({ thread_id: "PRRT_1", is_resolved: false })] }),
		});

		const run = runDiffWithArgs([], "", { env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "stack-session" } });

		expect(await run.exit).toBe(0);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(true);
		expect(envelope.data.resolved_inputs?.stack_plan).toMatchObject({ descriptor: "pr-address-stack-plan", sequence: 1 });
		expect(envelope.data.resolved_inputs?.current_thread_state).toMatchObject({ descriptor: "pr-address-stack-thread-state", sequence: 2 });
	});

	test("keeps resolved input audit facts on drift", async () => {
		const root = join(await makeTempDir(), "payload-root");
		await seedSession(root, "stack-session", {
			plan: stackPlan({ threadId: "PRRT_1" }),
			threadState: currentThreadState({
				threads: [thread({ thread_id: "PRRT_1", path: "renamed.ts", is_resolved: false }), thread({ thread_id: "PRRT_new", is_resolved: false })],
			}),
		});

		const run = runDiffWithArgs([], "", { env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "stack-session" } });

		expect(await run.exit).toBe(1);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(false);
		expect(envelope.data.resolved_inputs?.stack_plan.descriptor).toBe("pr-address-stack-plan");
		expect(envelope.data.resolved_inputs?.current_thread_state.descriptor).toBe("pr-address-stack-thread-state");
	});

	test("fails closed when the session has prep but no thread-state artifact", async () => {
		const root = join(await makeTempDir(), "payload-root");
		await seedSession(root, "stack-session", {
			plan: stackPlan({ threadId: "PRRT_1" }),
			prep: { legacy: "prep-only" },
		});

		const run = runDiffWithArgs([], "", { env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "stack-session" } });

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("payload_lookup_failed");
		expect(envelope.message).toContain("pr-address-stack-thread-state");
	});

	test("requires a harness session when empty stdin has no explicit source", async () => {
		const run = runDiffWithArgs([], "", { env: { PATH: "/fake/bin" } });

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("harness_session_required");
		expect(envelope.message).toContain("HARNESS_SESSION_ID");
	});
});

describe("stack-feedback-diff-current removed inputs", () => {
	function errorEnvelope(run: ScenarioRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	for (const removedOptionArgs of [
		["--payload-json", "{}"],
		["--payload-file", "payload.json"],
		["--stack-plan-reference", "stack-plan.json"],
		["--current-prep-reference", "current-prep.json"],
	]) {
		test(`rejects removed option ${removedOptionArgs[0]}`, async () => {
			const run = runDiffWithArgs(removedOptionArgs);

			expect(await run.exit).toBe(2);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toContain(`unknown option '${removedOptionArgs[0]}'`);
		});
	}

	test("rejects non-empty stdin", async () => {
		const run = runDiffWithArgs([], JSON.stringify({ stack_plan: stackPlan({ threadId: "PRRT_1" }), current_thread_state: currentThreadState({ threads: [thread()] }) }));

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("stack-feedback-diff-current");
		expect(envelope.message).toContain("no longer accepts JSON payloads on stdin");
		expect(envelope.message).toContain("payload-session artifacts");
	});
});

function parseDiffEnvelope(text: string): DiffEnvelope {
	return JSON.parse(text) as DiffEnvelope;
}

function stackPlan(options: { threadId: string }): {
	valid: boolean;
	pr_count: number;
	validation: { all_valid: boolean; per_pr: Array<{ pr_number: number; valid: boolean; counts: Record<string, never>; errors: never[] }> };
	batches: Array<{ batch_id: string; complexity: string; approval_required: boolean; items: Array<Record<string, unknown>> }>;
	informational: Array<Record<string, unknown>>;
} {
	return {
		valid: true,
		pr_count: 1,
		validation: { all_valid: true, per_pr: [{ pr_number: 42, valid: true, counts: {}, errors: [] }] },
		batches: [
			{
				batch_id: "local",
				complexity: "local",
				approval_required: false,
				items: [
					{
						pr_number: 42,
						branch: "feature",
						title: "Feature",
						url: "https://example.com/pr/42",
						source_batch_id: "local",
						source_kind: "review_thread",
						summary: "Fix the helper.",
						thread_id: options.threadId,
						path: "file.ts",
						line: 10,
						start_line: null,
						is_outdated: false,
					},
				],
			},
		],
		informational: [],
	};
}

function currentThreadState(options: { prNumber?: number | undefined; threads: Array<Record<string, unknown>> }): Record<string, unknown> {
	return {
		harness_session_id: "session",
		include_resolved: true,
		stack_thread_state_reference: null,
		summary: { prs: 1, review_threads: options.threads.length, unresolved_review_threads: options.threads.filter((thread) => thread.is_resolved !== true).length, resolved_review_threads: options.threads.filter((thread) => thread.is_resolved === true).length },
		stack: [
			{
				pr_number: options.prNumber ?? 42,
				branch: "feature",
				title: "Feature",
				url: "https://example.com/pr/42",
				head_ref_name: "feature",
				base_ref_name: "main",
				review_threads: options.threads,
				counts: { review_threads: options.threads.length, unresolved_review_threads: options.threads.filter((thread) => thread.is_resolved !== true).length, resolved_review_threads: options.threads.filter((thread) => thread.is_resolved === true).length },
			},
		],
	};
}

function thread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { thread_id: "PRRT_1", path: "file.ts", line: 10, start_line: null, is_resolved: false, is_outdated: false, comment_count: 1, ...overrides };
}
