import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { PayloadStore, type PayloadResult } from "../../src/payload-store.ts";
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
			current_prep: { descriptor: string; sequence: number };
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

function runDiff(payload: unknown): ScenarioRun {
	return runDiffWithArgs([], JSON.stringify(payload));
}

describe("stack-feedback-diff-current", () => {
	test("returns ok when planned actionable threads still match current feedback", async () => {
		const run = runDiff({
			stack_plan: stackPlan({ threadId: "PRRT_1" }),
			current_prep: currentPrep({ shouldIncludeResolved: true, threads: [thread({ thread_id: "PRRT_1", is_resolved: false })] }),
		});

		expect(await run.exit).toBe(0);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(true);
		expect(envelope.data.summary).toMatchObject({ planned_still_unresolved: 1, new_unresolved_threads: 0 });
	});

	test("returns negative when current feedback has drift", async () => {
		const run = runDiff({
			stack_plan: stackPlan({ threadId: "PRRT_1" }),
			current_prep: currentPrep({ shouldIncludeResolved: true, threads: [thread({ thread_id: "PRRT_1", path: "renamed.ts", is_resolved: false }), thread({ thread_id: "PRRT_new", is_resolved: false })] }),
		});

		expect(await run.exit).toBe(1);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.message).toContain("Current stack feedback differs");
		expect(envelope.data.safe_to_resolve_planned).toBe(false);
		expect(envelope.data.missing_or_outdated_planned_threads[0]).toMatchObject({ thread_id: "PRRT_1", reason: "metadata_changed", changed_fields: ["path"] });
		expect(envelope.data.new_unresolved_threads[0]).toMatchObject({ thread_id: "PRRT_new" });
	});

	test("validates stack membership and duplicate planned threads", async () => {
		const plan = stackPlan({ threadId: "PRRT_1" });
		plan.batches[0]?.items.push({ ...plan.batches[0].items[0] });
		const run = runDiff({
			stack_plan: plan,
			current_prep: currentPrep({ shouldIncludeResolved: true, prNumber: 100, threads: [thread({ thread_id: "PRRT_1" })] }),
		});

		expect(await run.exit).toBe(1);
		const codes = parseDiffEnvelope(run.stdout.join(""));
		expect(codes.data.errors.map((error) => error.code)).toEqual(["missing_current_pr", "unknown_current_pr", "duplicate_planned_thread"]);
	});
});

describe("stack-feedback-diff-current session inputs", () => {
	async function seedSession(root: string, sessionId: string, options: { plan: unknown; prep: unknown }): Promise<void> {
		const store = expectOk(await PayloadStore.open({ root, sessionId, clock: fixedClock("2026-01-02T03:04:05.000Z") }));
		expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("plan"), role: "summary", payload: options.plan }));
		expectOk(await store.writeJsonArtifact({ descriptor: stackArtifactDescriptor("prep"), role: "summary", payload: options.prep }));
	}

	test("resolves latest stack plan and current prep from an empty-stdin harness session", async () => {
		const root = join(await makeTempDir(), "payload-root");
		await seedSession(root, "stack-session", {
			plan: stackPlan({ threadId: "PRRT_1" }),
			prep: currentPrep({ shouldIncludeResolved: true, threads: [thread({ thread_id: "PRRT_1", is_resolved: false })] }),
		});

		const run = runDiffWithArgs([], "", { env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "stack-session" } });

		expect(await run.exit).toBe(0);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(true);
		expect(envelope.data.resolved_inputs?.stack_plan).toMatchObject({ descriptor: "pr-address-stack-plan", sequence: 1 });
		expect(envelope.data.resolved_inputs?.current_prep).toMatchObject({ descriptor: "pr-address-stack-prep", sequence: 2 });
	});

	test("keeps resolved input audit facts on drift", async () => {
		const root = join(await makeTempDir(), "payload-root");
		await seedSession(root, "stack-session", {
			plan: stackPlan({ threadId: "PRRT_1" }),
			prep: currentPrep({
				shouldIncludeResolved: true,
				threads: [thread({ thread_id: "PRRT_1", path: "renamed.ts", is_resolved: false }), thread({ thread_id: "PRRT_new", is_resolved: false })],
			}),
		});

		const run = runDiffWithArgs([], "", { env: { ASDL_PAYLOAD_ROOT: root, HARNESS_SESSION_ID: "stack-session" } });

		expect(await run.exit).toBe(1);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(false);
		expect(envelope.data.resolved_inputs?.stack_plan.descriptor).toBe("pr-address-stack-plan");
		expect(envelope.data.resolved_inputs?.current_prep.descriptor).toBe("pr-address-stack-prep");
	});

	test("requires a harness session when empty stdin has no explicit source", async () => {
		const run = runDiffWithArgs([], "", { env: { PATH: "/fake/bin" } });

		expect(await run.exit).toBe(2);
		const envelope = JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
		expect(envelope.error_type).toBe("harness_session_required");
		expect(envelope.message).toContain("HARNESS_SESSION_ID");
	});
});

describe("stack-feedback-diff-current reference inputs", () => {
	function referencedCurrentPrep(): Record<string, unknown> {
		return { ...currentPrep({ shouldIncludeResolved: true, threads: [thread()] }), summary: { prs: 1 } };
	}

	function errorEnvelope(run: ScenarioRun): { error_type: string; message: string } {
		return JSON.parse(run.stdout.join("")) as { error_type: string; message: string };
	}

	test("diffs from --stack-plan-reference and --current-prep-reference without a payload", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(["--stack-plan-reference", planPath, "--current-prep-reference", prepPath]);

		expect(await run.exit).toBe(0);
		const envelope = parseDiffEnvelope(run.stdout.join(""));
		expect(envelope.data.safe_to_resolve_planned).toBe(true);
		expect(envelope.data.summary).toMatchObject({ planned_still_unresolved: 1, new_unresolved_threads: 0 });
	});

	test("ignores stdin when every diff input is supplied by reference", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath, "--current-prep-reference", prepPath],
			JSON.stringify({ stack_plan: { would_conflict_if_read: true }, current_prep: { would_conflict_if_read: true } }),
		);

		expect(await run.exit).toBe(0);
		expect(parseDiffEnvelope(run.stdout.join("")).data.safe_to_resolve_planned).toBe(true);
	});

	test("combines one reference with the embedded payload key", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath],
			JSON.stringify({ current_prep: currentPrep({ shouldIncludeResolved: true, threads: [thread()] }) }),
		);

		expect(await run.exit).toBe(0);
		expect(parseDiffEnvelope(run.stdout.join("")).data.safe_to_resolve_planned).toBe(true);
	});

	test("rejects --stack-plan-reference combined with an embedded stack_plan key", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath],
			JSON.stringify({ stack_plan: stackPlan({ threadId: "PRRT_1" }), current_prep: referencedCurrentPrep() }),
		);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix an embedded stack_plan payload key with --stack-plan-reference");
	});

	test("rejects --current-prep-reference combined with an embedded current_prep key", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(
			["--stack-plan-reference", planPath, "--current-prep-reference", prepPath, "--payload-json", JSON.stringify({ current_prep: referencedCurrentPrep() })],
		);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("cannot mix an embedded current_prep payload key with --current-prep-reference");
	});

	test("rejects a missing reference file", async () => {
		const dir = await makeTempDir();
		const prepPath = join(dir, "current-prep.json");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(["--stack-plan-reference", join(dir, "missing.json"), "--current-prep-reference", prepPath]);

		expect(await run.exit).toBe(2);
		const envelope = errorEnvelope(run);
		expect(envelope.error_type).toBe("invalid_request");
		expect(envelope.message).toContain("must point to an existing file");
	});

	test("rejects malformed reference JSON", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, "{", "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const run = runDiffWithArgs(["--stack-plan-reference", planPath, "--current-prep-reference", prepPath]);

		expect(await run.exit).toBe(2);
		expect(errorEnvelope(run).error_type).toBe("invalid_json");
	});

	test("lets downstream validators diagnose reference artifacts with the wrong shape", async () => {
		const dir = await makeTempDir();
		const planPath = join(dir, "stack-plan.json");
		const prepPath = join(dir, "current-prep.json");
		await writeFile(planPath, JSON.stringify(stackPlan({ threadId: "PRRT_1" })), "utf8");
		await writeFile(prepPath, JSON.stringify(referencedCurrentPrep()), "utf8");

		const planAsPrep = runDiffWithArgs(["--stack-plan-reference", prepPath, "--current-prep-reference", prepPath]);
		expect(await planAsPrep.exit).toBe(1);
		expect(parseDiffEnvelope(planAsPrep.stdout.join("")).data.errors.map((error) => error.code)).toContain("invalid_stack_plan_shape");

		const prepAsPlan = runDiffWithArgs(["--stack-plan-reference", planPath, "--current-prep-reference", planPath]);
		expect(await prepAsPlan.exit).toBe(1);
		expect(parseDiffEnvelope(prepAsPlan.stdout.join("")).data.errors.map((error) => error.code)).toContain("missing_current_pr");
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

function currentPrep(options: { shouldIncludeResolved: boolean; prNumber?: number | undefined; threads: Array<Record<string, unknown>> }): Record<string, unknown> {
	return {
		harness_session_id: "session",
		include_resolved: options.shouldIncludeResolved,
		stack: [
			{
				pr_number: options.prNumber ?? 42,
				branch: "feature",
				title: "Feature",
				url: "https://example.com/pr/42",
				manifest: { review_threads: options.threads },
			},
		],
	};
}

function thread(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { thread_id: "PRRT_1", path: "file.ts", line: 10, start_line: null, is_resolved: false, is_outdated: false, comment_count: 1, ...overrides };
}
